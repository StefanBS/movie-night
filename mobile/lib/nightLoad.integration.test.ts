import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createNightLoad, nightLoadView } from "./nightLoad";
import type { Member } from "./members";
import type { Night } from "./nights";
import { type Handler, json, startServer } from "./testServer";
import { aMember, aNight } from "./fixtures";

// Integration tests: the Night routes' loading Session against a real local
// HTTP server over real fetch. No mocks — the test drives the Session only
// through the interface the Night view and Edit routes use.

const GROUP = "g1";
const NIGHT = "n1";
const MEMBERS: Member[] = [aMember("ada", { name: "Ada" }), aMember("blake", { name: "Blake" })];
const SAVED = aNight({ id: NIGHT });
const OTHER: Night = { ...SAVED, id: "n0", scheduledFor: "2026-06-19" };

// backend fakes the three reads the Session makes, counting each one.
function backend(over: Partial<Record<string, Handler>> = {}) {
  const hits: Record<string, number> = {};
  const handler: Handler = (req, res, body) => {
    const key = `${req.method} ${new URL(req.url ?? "", "http://x").pathname}`;
    hits[key] = (hits[key] ?? 0) + 1;
    const custom = over[key];
    if (custom !== undefined) {
      custom(req, res, body);
      return;
    }
    if (key === `GET /groups/${GROUP}/nights/${NIGHT}`) return json(res, 200, SAVED);
    if (key === `GET /groups/${GROUP}/members`) return json(res, 200, MEMBERS);
    if (key === `GET /groups/${GROUP}/nights`) return json(res, 200, [SAVED, OTHER]);
    json(res, 404, { error: `no route ${key}` });
  };
  return { handler, hits };
}

const fail = (_q: http.IncomingMessage, res: http.ServerResponse) => json(res, 500, { error: "boom" });

async function withLoad(
  handler: Handler,
  run: (load: ReturnType<typeof createNightLoad>) => Promise<void>,
  withNightDates = false,
) {
  const server = await startServer(handler);
  const load = createNightLoad({ baseUrl: server.url, groupId: GROUP, nightId: NIGHT, withNightDates });
  try {
    await run(load);
  } finally {
    load.dispose();
    await server.close();
  }
}

test("starts loading, then shows the Night and the roster", async () => {
  await withLoad(backend().handler, async (load) => {
    assert.equal(nightLoadView(load.state), "loading");
    await load.load();
    assert.equal(nightLoadView(load.state), "ready");
    assert.equal(load.state.night?.id, NIGHT);
    assert.deepEqual(load.state.members.map((m) => m.id), ["ada", "blake"]);
  });
});

test("the Night view skips the planned-nights fetch", async () => {
  const b = backend();
  await withLoad(b.handler, async (load) => {
    await load.load();
    assert.equal(b.hits[`GET /groups/${GROUP}/nights`], undefined);
    assert.deepEqual([...load.state.nightDates], []);
  });
});

test("the Edit route also loads the dates that hold a Night", async () => {
  await withLoad(
    backend().handler,
    async (load) => {
      await load.load();
      assert.deepEqual([...load.state.nightDates].sort(), ["2026-06-19", "2026-06-26"]);
    },
    true,
  );
});

test("a failed planned-nights fetch only loses the dots", async () => {
  await withLoad(
    backend({ [`GET /groups/${GROUP}/nights`]: fail }).handler,
    async (load) => {
      await load.load();
      assert.equal(nightLoadView(load.state), "ready");
      assert.deepEqual([...load.state.nightDates], []);
    },
    true,
  );
});

test("a Night the backend doesn't have is missing, not an error", async () => {
  await withLoad(
    backend({ [`GET /groups/${GROUP}/nights/${NIGHT}`]: (_q, res) => json(res, 404, { error: "not found" }) }).handler,
    async (load) => {
      await load.load();
      assert.equal(nightLoadView(load.state), "missing");
      assert.equal(load.state.error, null);
    },
  );
});

test("a failed first load fails the screen", async () => {
  await withLoad(backend({ [`GET /groups/${GROUP}/members`]: fail }).handler, async (load) => {
    await load.load();
    assert.equal(nightLoadView(load.state), "failed");
    assert.equal(load.state.error, "boom");
  });
});

test("a refresh keeps the Night on screen while it runs and when it fails", async () => {
  let failNext = false;
  const b = backend();
  await withLoad(
    backend({
      [`GET /groups/${GROUP}/members`]: (req, res, body) => (failNext ? fail(req, res) : b.handler(req, res, body)),
    }).handler,
    async (load) => {
      await load.load();
      failNext = true;
      const refresh = load.load();
      assert.equal(nightLoadView(load.state), "ready", "no spinner during a refresh");
      await refresh;
      assert.equal(nightLoadView(load.state), "ready");
      assert.equal(load.state.night?.id, NIGHT);
    },
  );
});

test("the data records when its load started", async () => {
  await withLoad(backend().handler, async (load) => {
    const before = performance.now();
    await load.load();
    assert.ok(load.state.loadStartedAt >= before);
    assert.ok(load.state.loadStartedAt <= performance.now());
  });
});

test("a refresh picks up changes made elsewhere", async () => {
  let current = SAVED;
  await withLoad(
    backend({ [`GET /groups/${GROUP}/nights/${NIGHT}`]: (_q, res) => json(res, 200, current) }).handler,
    async (load) => {
      await load.load();
      current = { ...SAVED, scheduledFor: "2026-07-03" };
      await load.load();
      assert.equal(load.state.night?.scheduledFor, "2026-07-03");
    },
  );
});

test("a newer load supersedes an older one", async () => {
  let calls = 0;
  let releaseFirst: () => void = () => {};
  const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  let firstArrived: () => void = () => {};
  const arrived = new Promise<void>((resolve) => (firstArrived = resolve));
  await withLoad(
    backend({
      [`GET /groups/${GROUP}/nights/${NIGHT}`]: (_q, res) => {
        calls++;
        if (calls === 1) {
          // Answer the first load only after the second has landed.
          firstArrived();
          void firstGate.then(() => json(res, 200, { ...SAVED, scheduledFor: "2026-01-01" }));
          return;
        }
        json(res, 200, SAVED);
      },
    }).handler,
    async (load) => {
      const first = load.load();
      await arrived;
      await load.load();
      releaseFirst();
      await first;
      assert.equal(load.state.night?.scheduledFor, SAVED.scheduledFor);
      assert.equal(load.state.error, null);
    },
  );
});
