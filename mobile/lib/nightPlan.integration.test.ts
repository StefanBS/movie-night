import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createNightPlan } from "./nightPlan";
import type { Member } from "./members";
import type { Night } from "./nights";
import type { TurnMember } from "./turn";

// Integration tests: the Plan module against a real local HTTP server over real
// fetch. No mocks — a throwaway server stands in for the backend, and the test
// drives the Plan only through the interface the New night screen uses.

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void;

async function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => handler(req, res, Buffer.concat(chunks).toString()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    throw new Error("server has no port");
  }
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

const GROUP = "g1";
const TODAY = "2026-06-22";

const member = (id: string, role: "core" | "guest" = "core"): Member => ({
  id,
  name: id,
  role,
  status: "active",
  joinedOn: "2026-01-01",
});
const ranked = (id: string): TurnMember => ({ id, name: id, role: "core", servedCount: 0, lastPickedOn: null });

const ROSTER = [member("ada"), member("blake"), member("frankie", "guest")];
const EXISTING: Night = {
  id: "n0",
  scheduledFor: "2026-06-19",
  startTime: null,
  pickerId: "ada",
  movie: null,
  attendees: [],
  reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
};

// backend is a small fake of the routes a Plan touches. The turn ranking is
// "present core members in roster order", which is enough to see reranks.
function backend(over: Partial<Record<string, Handler>> = {}): Handler {
  return (req, res, body) => {
    const url = new URL(req.url ?? "", "http://x");
    const key = `${req.method} ${url.pathname}`;
    const custom = over[key];
    if (custom !== undefined) {
      custom(req, res, body);
      return;
    }
    if (key === `GET /groups/${GROUP}/members`) return json(res, 200, ROSTER);
    if (key === `GET /groups/${GROUP}/nights`) return json(res, 200, [EXISTING]);
    if (key === `GET /groups/${GROUP}/turn`) {
      const present = (url.searchParams.get("present") ?? "").split(",");
      return json(res, 200, ROSTER.filter((m) => m.role === "core" && present.includes(m.id)).map((m) => ranked(m.id)));
    }
    if (key === `POST /groups/${GROUP}/nights`) {
      const req = JSON.parse(body) as { scheduledFor: string; startTime: string | null; attendees: string[]; pickerId: string };
      const night: Night = {
        id: "n1",
        scheduledFor: req.scheduledFor,
        startTime: req.startTime,
        pickerId: req.pickerId,
        reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
        movie: null,
        attendees: req.attendees.map((id) => ({ id, name: id, role: id === "frankie" ? "guest" : "core" })),
      };
      return json(res, 201, night);
    }
    json(res, 404, { error: `no route ${key}` });
  };
}

async function withPlan(
  handler: Handler,
  run: (plan: ReturnType<typeof createNightPlan>) => Promise<void>,
) {
  const server = await startServer(handler);
  const plan = createNightPlan({ baseUrl: server.url, groupId: GROUP, today: TODAY });
  try {
    await run(plan);
  } finally {
    plan.dispose();
    await server.close();
  }
}

test("load fills the roster and the calendar dots", async () => {
  await withPlan(backend(), async (plan) => {
    assert.equal(plan.state.loading, true);
    await plan.load();
    assert.equal(plan.state.loading, false);
    assert.equal(plan.state.error, null);
    assert.deepEqual(plan.state.members.map((m) => m.id), ["ada", "blake", "frankie"]);
    assert.deepEqual([...plan.state.nightDates], ["2026-06-19"]);
  });
});

test("load reports a roster failure", async () => {
  await withPlan(backend({ [`GET /groups/${GROUP}/members`]: (_q, res) => json(res, 500, { error: "boom" }) }), async (plan) => {
    await plan.load();
    assert.equal(plan.state.loading, false);
    assert.equal(plan.state.error, "boom");
  });
});

test("starts on When for today; choosing a date moves to Who; back returns", async () => {
  await withPlan(backend(), async (plan) => {
    assert.equal(plan.state.step, "when");
    assert.equal(plan.state.date, TODAY);
    plan.chooseDate("2026-06-26", null);
    assert.equal(plan.state.step, "who");
    assert.equal(plan.state.date, "2026-06-26");
    plan.back();
    assert.equal(plan.state.step, "when");
    assert.equal(plan.state.date, "2026-06-26");
  });
});

test("toggling reranks the attendees and the picker follows the order", async () => {
  const presents: string[] = [];
  const base = backend();
  await withPlan(
    backend({
      [`GET /groups/${GROUP}/turn`]: (req, res, body) => {
        presents.push(new URL(req.url ?? "", "http://x").searchParams.get("present") ?? "");
        base(req, res, body);
      },
    }),
    async (plan) => {
      await plan.toggle("blake");
      assert.deepEqual(plan.state.order.map((m) => m.id), ["blake"]);
      assert.equal(plan.state.pickerId, "blake");
      await plan.toggle("ada");
      assert.deepEqual(plan.state.order.map((m) => m.id), ["ada", "blake"]);
      assert.equal(plan.state.pickerId, "ada");
      await plan.toggle("ada");
      assert.deepEqual([...plan.state.attendeeIds], ["blake"]);
      assert.equal(plan.state.pickerId, "blake");
      assert.deepEqual(presents, ["blake", "blake,ada", "blake"]);
    },
  );
});

test("a stale order response never overwrites a newer one", async () => {
  const base = backend();
  let releaseSlow: () => void = () => {};
  const slowGate = new Promise<void>((resolve) => (releaseSlow = resolve));
  await withPlan(
    backend({
      [`GET /groups/${GROUP}/turn`]: (req, res, body) => {
        const present = new URL(req.url ?? "", "http://x").searchParams.get("present");
        if (present === "ada") {
          // Answer the first rank only after the second has landed.
          void slowGate.then(() => base(req, res, body));
          return;
        }
        base(req, res, body);
      },
    }),
    async (plan) => {
      const first = plan.toggle("ada");
      await plan.toggle("blake");
      releaseSlow();
      await first;
      assert.deepEqual(plan.state.order.map((m) => m.id), ["ada", "blake"]);
    },
  );
});

test("a guest-only plan has no picker until one is chosen", async () => {
  await withPlan(backend(), async (plan) => {
    await plan.toggle("frankie");
    assert.deepEqual(plan.state.order, []);
    assert.equal(plan.state.pickerId, null);
    plan.choosePicker("frankie");
    assert.equal(plan.state.pickerId, "frankie");
  });
});

test("removing the chosen picker hands the pick back to the order", async () => {
  await withPlan(backend(), async (plan) => {
    await plan.toggle("ada");
    await plan.toggle("blake");
    plan.choosePicker("blake");
    assert.equal(plan.state.pickerId, "blake");
    await plan.toggle("blake");
    assert.equal(plan.state.pickerId, "ada");
    // Re-adding them does not restore the old choice.
    await plan.toggle("blake");
    assert.equal(plan.state.pickerId, "ada");
  });
});

test("create posts the date, attendees and picker and returns the Night", async () => {
  let posted: unknown = null;
  const base = backend();
  await withPlan(
    backend({
      [`POST /groups/${GROUP}/nights`]: (req, res, body) => {
        posted = JSON.parse(body);
        base(req, res, body);
      },
    }),
    async (plan) => {
      plan.chooseDate("2026-06-26", null);
      await plan.toggle("ada");
      await plan.toggle("frankie");
      const night = await plan.create();
      assert.deepEqual(posted, { scheduledFor: "2026-06-26", startTime: null, attendees: ["ada", "frankie"], pickerId: "ada" });
      assert.equal(night?.id, "n1");
      assert.equal(plan.state.busy, null);
    },
  );
});

test("create posts the start time chosen with the date", async () => {
  let posted: { startTime?: unknown } | null = null;
  const base = backend();
  await withPlan(
    backend({
      [`POST /groups/${GROUP}/nights`]: (req, res, body) => {
        posted = JSON.parse(body) as { startTime?: unknown };
        base(req, res, body);
      },
    }),
    async (plan) => {
      plan.chooseDate("2026-06-26", "20:15");
      assert.equal(plan.state.startTime, "20:15");
      await plan.toggle("ada");
      const night = await plan.create();
      assert.equal(posted?.startTime, "20:15");
      assert.equal(night?.startTime, "20:15");
    },
  );
});

test("create without a picker sends nothing", async () => {
  let posts = 0;
  await withPlan(
    backend({ [`POST /groups/${GROUP}/nights`]: (_q, res) => (posts++, json(res, 201, {})) }),
    async (plan) => {
      assert.equal(await plan.create(), null);
      assert.equal(posts, 0);
    },
  );
});

test("a taken date surfaces the backend's message and keeps the plan", async () => {
  await withPlan(
    backend({
      [`POST /groups/${GROUP}/nights`]: (_q, res) => json(res, 409, { error: "there is already a night on that date" }),
    }),
    async (plan) => {
      plan.chooseDate("2026-06-19", null);
      await plan.toggle("ada");
      assert.equal(await plan.create(), null);
      assert.equal(plan.state.actionError, "there is already a night on that date");
      assert.equal(plan.state.busy, null);
      assert.equal(plan.state.step, "who", "plan stays put");
      assert.deepEqual([...plan.state.attendeeIds], ["ada"]);
    },
  );
});

test("choosing a new date clears the last create error", async () => {
  await withPlan(
    backend({ [`POST /groups/${GROUP}/nights`]: (_q, res) => json(res, 409, { error: "taken" }) }),
    async (plan) => {
      await plan.toggle("ada");
      await plan.create();
      plan.chooseDate("2026-06-27", null);
      assert.equal(plan.state.actionError, null);
    },
  );
});

test("a double create sends one request", async () => {
  let posts = 0;
  const base = backend();
  await withPlan(
    backend({
      [`POST /groups/${GROUP}/nights`]: (req, res, body) => {
        posts++;
        base(req, res, body);
      },
    }),
    async (plan) => {
      await plan.toggle("ada");
      const [a, b] = await Promise.all([plan.create(), plan.create()]);
      assert.equal(posts, 1);
      assert.equal(a?.id, "n1");
      assert.equal(b, null);
    },
  );
});

test("subscribers hear every change", async () => {
  await withPlan(backend(), async (plan) => {
    let calls = 0;
    const unsubscribe = plan.subscribe(() => calls++);
    plan.chooseDate("2026-06-26", null);
    assert.ok(calls >= 1);
    unsubscribe();
    const before = calls;
    plan.back();
    assert.equal(calls, before);
  });
});
