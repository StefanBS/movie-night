import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createNightEditor } from "./nightEditor";
import type { Member } from "./members";
import type { Movie } from "./movies";
import type { Night } from "./nights";

// Integration tests: the editor module for a saved Night against a real local
// HTTP server over real fetch. No mocks — the test drives the editor only
// through the interface the Night screens use.

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
const DUNE: Movie = { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: null };
const MEMBERS: Member[] = [
  { id: "ada", name: "Ada", role: "core", status: "active", joinedOn: "2026-01-01" },
  { id: "blake", name: "Blake", role: "core", status: "active", joinedOn: "2026-01-01" },
];
const SAVED: Night = {
  id: NIGHT,
  scheduledFor: "2026-06-26",
  startTime: null,
  pickerId: "ada",
  reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
  movie: null,
  attendees: [
    { id: "ada", name: "Ada", role: "core" },
    { id: "blake", name: "Blake", role: "core" },
  ],
};

// backend fakes the routes the editor touches, keeping one Night in memory.
function backend(over: Partial<Record<string, Handler>> = {}): Handler {
  let night = SAVED;
  return (req, res, body) => {
    const url = new URL(req.url ?? "", "http://x");
    const key = `${req.method} ${url.pathname}`;
    const custom = over[key];
    if (custom !== undefined) {
      custom(req, res, body);
      return;
    }
    const base = `/groups/${GROUP}/nights/${NIGHT}`;
    if (key === "GET /movies/search") return json(res, 200, url.searchParams.get("q") === "dune" ? [DUNE] : []);
    if (key === `POST ${base}/movie`) return json(res, 200, (night = { ...night, movie: DUNE }));
    if (key === `DELETE ${base}/movie`) return json(res, 200, (night = { ...night, movie: null }));
    if (key === `POST ${base}/pick`) {
      const { pickerId } = JSON.parse(body) as { pickerId: string };
      return json(res, 200, (night = { ...night, pickerId }));
    }
    json(res, 404, { error: `no route ${key}` });
  };
}

async function withEditor(
  handler: Handler,
  run: (editor: ReturnType<typeof createNightEditor>) => Promise<void>,
  initialStep?: "pick" | "night",
) {
  const server = await startServer(handler);
  const editor = createNightEditor({ baseUrl: server.url, groupId: GROUP, night: SAVED, members: MEMBERS, initialStep });
  try {
    await run(editor);
  } finally {
    editor.dispose();
    await server.close();
  }
}

test("opens on the Night view by default, or where asked", async () => {
  await withEditor(backend(), async (editor) => {
    assert.equal(editor.state.step, "night");
    assert.equal(editor.state.night.id, NIGHT);
    assert.equal(editor.state.members.length, 2);
  });
  await withEditor(backend(), async (editor) => assert.equal(editor.state.step, "pick"), "pick");
});

test("pickFilm and toNight move between the steps", async () => {
  await withEditor(backend(), async (editor) => {
    editor.pickFilm();
    assert.equal(editor.state.step, "pick");
    editor.toNight();
    assert.equal(editor.state.step, "night");
  });
});

test("search fills the results; a blank query does nothing", async () => {
  let searches = 0;
  const base = backend();
  await withEditor(
    backend({ "GET /movies/search": (req, res, body) => (searches++, base(req, res, body)) }),
    async (editor) => {
      await editor.search("   ");
      assert.equal(searches, 0);
      await editor.search(" dune ");
      assert.equal(searches, 1);
      assert.deepEqual(editor.state.results, [DUNE]);
      assert.equal(editor.state.searching, false);
      assert.equal(editor.state.searchError, null);
    },
  );
});

test("a failed search reports its error", async () => {
  await withEditor(
    backend({ "GET /movies/search": (_q, res) => json(res, 503, { error: "movie search is not configured" }) }),
    async (editor) => {
      await editor.search("dune");
      assert.equal(editor.state.searchError, "movie search is not configured");
      assert.equal(editor.state.searching, false);
    },
  );
});

test("attach sets the film, clears the results and returns to the Night view", async () => {
  await withEditor(
    backend(),
    async (editor) => {
      await editor.search("dune");
      const night = await editor.attach(DUNE.tmdbId);
      assert.equal(night?.movie?.title, "Dune");
      assert.equal(editor.state.night.movie?.title, "Dune");
      assert.deepEqual(editor.state.results, []);
      assert.equal(editor.state.step, "night");
      assert.equal(editor.state.busy, null);
    },
    "pick",
  );
});

test("a failed write reports its error and keeps the Night", async () => {
  await withEditor(
    backend({ [`POST /groups/${GROUP}/nights/${NIGHT}/movie`]: (_q, res) => json(res, 502, { error: "tmdb unavailable" }) }),
    async (editor) => {
      assert.equal(await editor.attach(DUNE.tmdbId), null);
      assert.equal(editor.state.actionError, "tmdb unavailable");
      assert.equal(editor.state.night.movie, null);
      assert.equal(editor.state.step, "pick");
      assert.equal(editor.state.busy, null);
    },
    "pick",
  );
});

test("only one write runs at a time", async () => {
  let writes = 0;
  const base = backend();
  await withEditor(
    backend({
      [`POST /groups/${GROUP}/nights/${NIGHT}/pick`]: (req, res, body) => (writes++, base(req, res, body)),
      [`POST /groups/${GROUP}/nights/${NIGHT}/movie`]: (req, res, body) => (writes++, base(req, res, body)),
    }),
    async (editor) => {
      const first = editor.changePicker("blake");
      assert.equal(editor.state.busy, "blake");
      assert.equal(await editor.attach(DUNE.tmdbId), null, "second write is refused while busy");
      await first;
      assert.equal(writes, 1);
    },
  );
});

test("changePicker updates the stored picker", async () => {
  await withEditor(backend(), async (editor) => {
    const night = await editor.changePicker("blake");
    assert.equal(night?.pickerId, "blake");
    assert.equal(editor.state.night.pickerId, "blake");
  });
});

test("clearFilm removes the film; with no film it sends nothing", async () => {
  let clears = 0;
  const base = backend();
  await withEditor(
    backend({ [`DELETE /groups/${GROUP}/nights/${NIGHT}/movie`]: (req, res, body) => (clears++, base(req, res, body)) }),
    async (editor) => {
      await editor.clearFilm();
      assert.equal(clears, 0);
      await editor.attach(DUNE.tmdbId);
      await editor.clearFilm();
      assert.equal(clears, 1);
      assert.equal(editor.state.night.movie, null);
      assert.equal(editor.state.step, "night");
    },
  );
});

test("a write clears the previous error", async () => {
  let fail = true;
  const base = backend();
  await withEditor(
    backend({
      [`POST /groups/${GROUP}/nights/${NIGHT}/pick`]: (req, res, body) =>
        fail ? json(res, 422, { error: "picker is not an attendee of this night" }) : base(req, res, body),
    }),
    async (editor) => {
      await editor.changePicker("zed");
      assert.equal(editor.state.actionError, "picker is not an attendee of this night");
      fail = false;
      await editor.changePicker("blake");
      assert.equal(editor.state.actionError, null);
    },
  );
});
