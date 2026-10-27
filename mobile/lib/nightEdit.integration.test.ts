import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createNightEdit } from "./nightEdit";
import type { Member } from "./members";
import type { Night } from "./nights";

// Integration tests: the Edit screen's session against a real local HTTP
// server over real fetch. No mocks — the test drives the session only through
// the interface the Edit screen uses.

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
const NIGHT = "n1";
const PATH = `/groups/${GROUP}/nights/${NIGHT}`;
const MEMBERS: Member[] = [
  { id: "ada", name: "Ada", role: "core", status: "active", joinedOn: "2026-01-01" },
  { id: "blake", name: "Blake", role: "core", status: "active", joinedOn: "2026-01-01" },
  { id: "frankie", name: "Frankie", role: "guest", status: "active", joinedOn: "2026-01-01" },
];
const SAVED: Night = {
  id: NIGHT,
  scheduledFor: "2026-06-26",
  pickerId: "ada",
  movie: null,
  attendees: [
    { id: "ada", name: "Ada", role: "core" },
    { id: "frankie", name: "Frankie", role: "guest" },
  ],
};

type Edit = { scheduledFor: string; attendees: string[] };

// backend fakes the two routes the session touches, recording every request
// and applying a PATCH to its one Night in memory.
function backend(over: Partial<Record<string, Handler>> = {}) {
  const requests: { key: string; body: string }[] = [];
  let night = SAVED;
  const handler: Handler = (req, res, body) => {
    const key = `${req.method} ${new URL(req.url ?? "", "http://x").pathname}`;
    requests.push({ key, body });
    const custom = over[key];
    if (custom !== undefined) {
      custom(req, res, body);
      return;
    }
    if (key === `PATCH ${PATH}`) {
      const edit = JSON.parse(body) as Edit;
      night = {
        ...night,
        scheduledFor: edit.scheduledFor,
        attendees: edit.attendees.map((id) => {
          const m = MEMBERS.find((x) => x.id === id);
          return { id, name: m?.name ?? id, role: m?.role ?? "core" };
        }),
      };
      return json(res, 200, night);
    }
    if (key === `DELETE ${PATH}`) {
      res.statusCode = 204;
      return res.end();
    }
    json(res, 404, { error: `no route ${key}` });
  };
  return { handler, requests };
}

async function withEdit(
  handler: Handler,
  run: (edit: ReturnType<typeof createNightEdit>) => Promise<void>,
) {
  const server = await startServer(handler);
  const edit = createNightEdit({ baseUrl: server.url, groupId: GROUP, night: SAVED, members: MEMBERS });
  try {
    await run(edit);
  } finally {
    edit.dispose();
    await server.close();
  }
}

const ids = (s: ReadonlySet<string>) => [...s].sort();

test("opens with the stored Night as the draft, not dirty", async () => {
  await withEdit(backend().handler, async (edit) => {
    assert.equal(edit.state.date, "2026-06-26");
    assert.deepEqual(ids(edit.state.attendees), ["ada", "frankie"]);
    assert.equal(edit.state.dirty, false);
    assert.deepEqual(edit.state.rows.map((r) => r.id), ["ada", "blake", "frankie"]);
  });
});

test("toggling and changing the date make the draft dirty; undoing them doesn't", async () => {
  await withEdit(backend().handler, async (edit) => {
    edit.toggle("blake");
    assert.deepEqual(ids(edit.state.attendees), ["ada", "blake", "frankie"]);
    assert.equal(edit.state.dirty, true);
    edit.toggle("blake");
    assert.equal(edit.state.dirty, false);
    edit.setDate("2026-07-03");
    assert.equal(edit.state.dirty, true);
    edit.setDate("2026-06-26");
    assert.equal(edit.state.dirty, false);
  });
});

test("the picker can't be toggled off: the picker is always an attendee", async () => {
  await withEdit(backend().handler, async (edit) => {
    edit.toggle("ada");
    assert.ok(edit.state.attendees.has("ada"));
    assert.equal(edit.state.dirty, false);
  });
});

test("save sends exactly one PATCH with the whole draft and keeps the result", async () => {
  const { handler, requests } = backend();
  await withEdit(handler, async (edit) => {
    edit.setDate("2026-07-03");
    edit.toggle("blake");
    edit.toggle("frankie");
    const saved = await edit.save();
    assert.deepEqual(requests.map((r) => r.key), [`PATCH ${PATH}`]);
    const sent = JSON.parse(requests[0].body) as Edit;
    assert.equal(sent.scheduledFor, "2026-07-03");
    assert.deepEqual([...sent.attendees].sort(), ["ada", "blake"]);
    assert.equal(saved?.scheduledFor, "2026-07-03");
    assert.equal(edit.state.night.scheduledFor, "2026-07-03");
    assert.equal(edit.state.dirty, false);
    assert.equal(edit.state.busy, null);
    // The removed guest is no longer an attendee, so their row goes too.
    assert.deepEqual(edit.state.rows.map((r) => r.id), ["ada", "blake"]);
  });
});

test("save does nothing when the draft is unchanged", async () => {
  const { handler, requests } = backend();
  await withEdit(handler, async (edit) => {
    assert.equal(await edit.save(), null);
    assert.equal(requests.length, 0);
  });
});

test("a failed save reports its error and keeps both the stored Night and the draft", async () => {
  const { handler } = backend({
    [`PATCH ${PATH}`]: (_q, res) => json(res, 409, { error: "there is already a night on that date" }),
  });
  await withEdit(handler, async (edit) => {
    edit.setDate("2026-07-03");
    edit.toggle("blake");
    assert.equal(await edit.save(), null);
    assert.equal(edit.state.actionError, "there is already a night on that date");
    assert.deepEqual(edit.state.night, SAVED);
    assert.equal(edit.state.date, "2026-07-03");
    assert.deepEqual(ids(edit.state.attendees), ["ada", "blake", "frankie"]);
    assert.equal(edit.state.dirty, true);
    assert.equal(edit.state.busy, null);
  });
});

test("only one write runs at a time", async () => {
  const { handler, requests } = backend();
  await withEdit(handler, async (edit) => {
    edit.toggle("blake");
    const first = edit.save();
    assert.equal(edit.state.busy, "save");
    assert.equal(await edit.save(), null, "second save is refused while busy");
    assert.equal(await edit.cancelNight(), false, "cancel is refused while busy");
    await first;
    assert.equal(requests.length, 1);
  });
});

test("cancelNight deletes the Night", async () => {
  const { handler, requests } = backend();
  await withEdit(handler, async (edit) => {
    assert.equal(await edit.cancelNight(), true);
    assert.deepEqual(requests.map((r) => r.key), [`DELETE ${PATH}`]);
    assert.equal(edit.state.busy, null);
  });
});

test("a failed cancel reports its error", async () => {
  const { handler } = backend({
    [`DELETE ${PATH}`]: (_q, res) => json(res, 500, { error: "internal error" }),
  });
  await withEdit(handler, async (edit) => {
    assert.equal(await edit.cancelNight(), false);
    assert.equal(edit.state.actionError, "internal error");
    assert.equal(edit.state.busy, null);
  });
});
