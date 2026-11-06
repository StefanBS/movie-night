import { test } from "node:test";
import assert from "node:assert/strict";

import { createNightWatched } from "./nightWatched";
import type { Night } from "./nights";
import { type Handler, json, startServer } from "./testServer";
import { aMember, aMovie, aNight, aTurnMember } from "./fixtures";

// Integration tests: the "We watched it" module against a real local HTTP
// server over real fetch. No mocks — a throwaway server stands in for the
// backend, and the test drives the module only through the interface the
// route uses.

const GROUP = "g1";

const ROSTER = [aMember("ada"), aMember("blake"), aMember("cleo"), aMember("frankie", { role: "guest" })];
// PLANNED is a due Night with a film: Blake picked, Blake and Cleo were coming.
const PLANNED = aNight({
  scheduledFor: "2026-06-19",
  startTime: "20:00",
  pickerId: "blake",
  movie: aMovie({ tmdbId: 7, title: "Past Lives", releaseYear: 2023, runtimeMinutes: 106 }),
  attendees: [
    { id: "blake", name: "blake" },
    { id: "cleo", name: "cleo" },
  ],
});

type Patch = { scheduledFor: string; startTime: string | null; attendees: string[]; pickerId: string; watched: boolean };

// backend fakes the routes the flow touches. The night's turn ranks every
// core member in roster order, attending or not. `patches` collects every PATCH.
function backend(over: Partial<Record<string, Handler>> = {}, patches: Patch[] = []): Handler {
  return (req, res, body) => {
    const url = new URL(req.url ?? "", "http://x");
    const key = `${req.method} ${url.pathname}`;
    const custom = over[key];
    if (custom !== undefined) {
      custom(req, res, body);
      return;
    }
    if (key === `GET /groups/${GROUP}/members`) return json(res, 200, ROSTER);
    if (key === `GET /groups/${GROUP}/nights/n1`) return json(res, 200, PLANNED);
    if (key === `GET /groups/${GROUP}/nights/n1/turn`) {
      return json(res, 200, ROSTER.filter((m) => m.role === "core").map((m) => aTurnMember(m.id)));
    }
    if (key === `PATCH /groups/${GROUP}/nights/n1`) {
      const patch = JSON.parse(body) as Patch;
      patches.push(patch);
      const night: Night = {
        ...PLANNED,
        pickerId: patch.pickerId,
        attendees: patch.attendees.map((id) => ({ id, name: id })),
        watchedAt: "2026-06-19T22:00:00Z",
        repeat: null,
      };
      return json(res, 200, night);
    }
    json(res, 404, { error: `no route ${key}` });
  };
}

async function withFlow(
  handler: Handler,
  run: (flow: ReturnType<typeof createNightWatched>) => Promise<void>,
) {
  const server = await startServer(handler);
  const flow = createNightWatched({ baseUrl: server.url, groupId: GROUP, nightId: "n1" });
  try {
    await run(flow);
  } finally {
    flow.dispose();
    await server.close();
  }
}

test("load opens People pre-filled with the night's attendees and its picker", async () => {
  await withFlow(backend(), async (flow) => {
    assert.equal(flow.state.loading, true);
    await flow.load();
    assert.equal(flow.state.loading, false);
    assert.equal(flow.state.error, null);
    assert.equal(flow.state.step, "who");
    assert.equal(flow.state.night?.id, "n1");
    assert.deepEqual(flow.state.members.map((m) => m.id), ["ada", "blake", "cleo", "frankie"]);
    assert.deepEqual([...flow.state.attendeeIds].sort(), ["blake", "cleo"]);
    // The planned picker keeps the pick, though Cleo would rank ahead of them.
    assert.equal(flow.state.pickerId, "blake");
  });
});

test("load of a Night the backend doesn't have leaves night null without an error", async () => {
  const missing: Handler = (_q, res) => json(res, 404, { error: "night not found" });
  await withFlow(
    backend({ [`GET /groups/${GROUP}/nights/n1`]: missing, [`GET /groups/${GROUP}/nights/n1/turn`]: missing }),
    async (flow) => {
      await flow.load();
      assert.equal(flow.state.loading, false);
      assert.equal(flow.state.error, null);
      assert.equal(flow.state.night, null);
    },
  );
});

test("load reports a roster failure", async () => {
  await withFlow(backend({ [`GET /groups/${GROUP}/members`]: (_q, res) => json(res, 500, { error: "boom" }) }), async (flow) => {
    await flow.load();
    assert.equal(flow.state.loading, false);
    assert.equal(flow.state.error, "boom");
  });
});

test("removing the planned picker gives the pick to whoever's next up and here", async () => {
  await withFlow(backend(), async (flow) => {
    await flow.load();
    flow.toggle("ada"); // Ada came too; Blake still has the pick
    assert.equal(flow.state.pickerId, "blake");
    flow.toggle("blake"); // Blake didn't make it
    assert.deepEqual([...flow.state.attendeeIds].sort(), ["ada", "cleo"]);
    assert.equal(flow.state.pickerId, "ada");
    flow.toggle("blake"); // back again: the order decides now
    assert.equal(flow.state.pickerId, "ada");
  });
});

test("toggling reranks from the loaded ranking without a request", async () => {
  let turnRequests = 0;
  const base = backend();
  await withFlow(
    backend({
      [`GET /groups/${GROUP}/nights/n1/turn`]: (req, res, body) => {
        turnRequests++;
        base(req, res, body);
      },
    }),
    async (flow) => {
      await flow.load();
      assert.deepEqual(flow.state.order.map((m) => m.id), ["blake", "cleo"]);
      flow.toggle("ada"); // not a stored attendee, but in the full ranking
      assert.deepEqual(flow.state.order.map((m) => m.id), ["ada", "blake", "cleo"]);
      flow.toggle("blake");
      assert.deepEqual(flow.state.order.map((m) => m.id), ["ada", "cleo"]);
      assert.equal(turnRequests, 1);
    },
  );
});

test("removing everyone leaves no picker", async () => {
  await withFlow(backend(), async (flow) => {
    await flow.load();
    flow.toggle("blake");
    flow.toggle("cleo");
    assert.equal(flow.state.attendeeIds.size, 0);
    assert.equal(flow.state.pickerId, null);
  });
});

test("choosePicker overrides the order until they leave", async () => {
  await withFlow(backend(), async (flow) => {
    await flow.load();
    flow.toggle("frankie");
    flow.choosePicker("frankie");
    assert.equal(flow.state.pickerId, "frankie");
    flow.toggle("frankie");
    assert.equal(flow.state.pickerId, "blake"); // the order's head
  });
});

test("record saves who came and who picked as watched, then shows Done; back returns to People", async () => {
  const patches: Patch[] = [];
  await withFlow(backend({}, patches), async (flow) => {
    await flow.load();
    flow.toggle("blake"); // the planned picker didn't make it
    const night = await flow.record();
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0].attendees, ["cleo"]);
    assert.equal(patches[0].pickerId, "cleo");
    assert.equal(patches[0].watched, true);
    assert.equal(patches[0].scheduledFor, "2026-06-19");
    assert.equal(patches[0].startTime, "20:00");
    // Done credits the recorded picker.
    assert.equal(night?.pickerId, "cleo");
    assert.equal(flow.state.step, "done");
    assert.equal(flow.state.night?.pickerId, "cleo");
    assert.notEqual(flow.state.night?.watchedAt, null);
    flow.back();
    assert.equal(flow.state.step, "who");
    assert.deepEqual([...flow.state.attendeeIds], ["cleo"]);
  });
});

test("a failed record shows the error and stays on People with the selection intact", async () => {
  const refuse: Handler = (_q, res) => json(res, 422, { error: "a watched night must have a film" });
  await withFlow(backend({ [`PATCH /groups/${GROUP}/nights/n1`]: refuse }), async (flow) => {
    await flow.load();
    flow.toggle("ada");
    assert.equal(await flow.record(), null);
    assert.equal(flow.state.step, "who");
    assert.equal(flow.state.busy, null);
    assert.equal(flow.state.actionError, "a watched night must have a film");
    assert.deepEqual([...flow.state.attendeeIds].sort(), ["ada", "blake", "cleo"]);
    assert.equal(flow.state.pickerId, "blake");
    assert.equal(flow.state.night?.watchedAt, null);
  });
});

test("record without a picker sends nothing", async () => {
  const patches: Patch[] = [];
  await withFlow(backend({}, patches), async (flow) => {
    await flow.load();
    flow.toggle("blake");
    flow.toggle("cleo");
    assert.equal(await flow.record(), null);
    assert.equal(patches.length, 0);
    assert.equal(flow.state.step, "who");
  });
});
