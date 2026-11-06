import { test } from "node:test";
import assert from "node:assert/strict";

import { createNightEditor } from "./nightEditor";
import type { Movie } from "./movies";
import type { Night } from "./nights";
import { type Handler, json, startServer } from "./testServer";

// Integration tests: the editor module for a saved Night against a real local
// HTTP server over real fetch. No mocks — the test drives the editor only
// through the interface the Night screens use.

const GROUP = "g1";
const NIGHT = "n1";
const DUNE: Movie = { tmdbId: 438631, title: "Dune", releaseYear: 2021, posterUrl: null, genres: [], runtimeMinutes: null };
const SAVED: Night = {
  id: NIGHT,
  scheduledFor: "2026-06-26",
  startTime: null,
  pickerId: "ada",
  reminders: { nightBefore: true, morningOf: true, twoHoursBefore: true, audience: "everyone" },
  watchedAt: null,
  repeat: null,
  movie: null,
  attendees: [
    { id: "ada", name: "Ada" },
    { id: "blake", name: "Blake" },
  ],
};

// PAST_DUNE is an earlier Night of the group that watched Dune.
const PAST_DUNE: Night = { ...SAVED, id: "n0", scheduledFor: "2026-05-02", movie: DUNE };

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
    if (key === `GET /groups/${GROUP}/nights`) return json(res, 200, [PAST_DUNE, night]);
    if (key === "GET /movies/search") return json(res, 200, url.searchParams.get("q") === "dune" ? [DUNE] : []);
    if (key === `POST ${base}/movie`) return json(res, 200, (night = { ...night, movie: DUNE }));
    if (key === `DELETE ${base}/movie`) return json(res, 200, (night = { ...night, movie: null }));
    if (key === `PATCH ${base}`) {
      const { pickerId } = JSON.parse(body) as { pickerId?: string };
      return json(res, 200, (night = { ...night, pickerId: pickerId ?? night.pickerId }));
    }
    json(res, 404, { error: `no route ${key}` });
  };
}

// until waits for a background load to land.
async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.ok(done(), "timed out waiting");
}

async function withEditor(
  handler: Handler,
  run: (editor: ReturnType<typeof createNightEditor>) => Promise<void>,
  initialStep?: "pick" | "night",
) {
  const server = await startServer(handler);
  const editor = createNightEditor({ baseUrl: server.url, groupId: GROUP, night: SAVED, initialStep });
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

test("search fills the results; a blank query clears them without a request", async () => {
  let searches = 0;
  const base = backend();
  await withEditor(
    backend({ "GET /movies/search": (req, res, body) => (searches++, base(req, res, body)) }),
    async (editor) => {
      await editor.search(" dune ");
      assert.equal(searches, 1);
      assert.deepEqual(editor.state.results, [DUNE]);
      assert.equal(editor.state.resultsFor, "dune");
      assert.equal(editor.state.searching, false);
      assert.equal(editor.state.searchError, null);
      await editor.search("   ");
      assert.equal(searches, 1);
      assert.deepEqual(editor.state.results, []);
      assert.equal(editor.state.resultsFor, "");
    },
  );
});

test("the same query again (submit after the debounce) sends one request", async () => {
  let searches = 0;
  const base = backend();
  await withEditor(
    backend({ "GET /movies/search": (req, res, body) => (searches++, base(req, res, body)) }),
    async (editor) => {
      const running = editor.search("dune");
      await editor.search("dune "); // while the first is in flight
      await running;
      await editor.search("dune"); // once it has answered
      assert.equal(searches, 1);
      assert.deepEqual(editor.state.results, [DUNE]);
    },
  );
});

test("a newer search replaces one still running", async () => {
  const base = backend();
  await withEditor(
    backend({
      // The first query answers last; its results must not land.
      "GET /movies/search": (req, res, body) => {
        const slow = new URL(req.url ?? "", "http://x").searchParams.get("q") === "du";
        setTimeout(() => base(req, res, body), slow ? 100 : 0);
      },
    }),
    async (editor) => {
      const first = editor.search("du");
      await editor.search("dune");
      await first;
      assert.deepEqual(editor.state.results, [DUNE]);
      assert.equal(editor.state.resultsFor, "dune");
      assert.equal(editor.state.searching, false);
      assert.equal(editor.state.searchError, null);
    },
  );
});

test("opening the Pick step loads the group's Nights once", async () => {
  let loads = 0;
  const base = backend();
  const handler = backend({
    [`GET /groups/${GROUP}/nights`]: (req, res, body) => (loads++, base(req, res, body)),
  });
  await withEditor(handler, async (editor) => {
    assert.equal(loads, 0);
    editor.pickFilm();
    await until(() => editor.state.groupNights.length > 0);
    assert.deepEqual(editor.state.groupNights.map((n) => n.id), ["n0", NIGHT]);
    editor.toNight();
    editor.pickFilm();
    assert.equal(loads, 1);
  });
  await withEditor(
    handler,
    async (editor) => {
      await until(() => editor.state.groupNights.length > 0);
      assert.equal(loads, 2);
    },
    "pick",
  );
});

test("a failed load of the group's Nights leaves no hints and no error", async () => {
  await withEditor(
    backend({ [`GET /groups/${GROUP}/nights`]: (_q, res) => json(res, 500, { error: "boom" }) }),
    async (editor) => {
      editor.pickFilm();
      await new Promise((r) => setTimeout(r, 50));
      assert.deepEqual(editor.state.groupNights, []);
      assert.equal(editor.state.actionError, null);
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
      [`PATCH /groups/${GROUP}/nights/${NIGHT}`]: (req, res, body) => (writes++, base(req, res, body)),
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
      [`PATCH /groups/${GROUP}/nights/${NIGHT}`]: (req, res, body) =>
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

test("refresh swaps in a fresher Night but keeps the step and search", async () => {
  await withEditor(
    backend(),
    async (editor) => {
      await editor.search("dune");
      const moved = { ...SAVED, scheduledFor: "2026-07-03" };
      editor.refresh(moved, performance.now());
      assert.equal(editor.state.night.scheduledFor, "2026-07-03");
      assert.equal(editor.state.step, "pick");
      assert.deepEqual(editor.state.results, [DUNE]);
    },
    "pick",
  );
});

test("refresh is ignored while a write runs, so the write's reply wins", async () => {
  await withEditor(backend(), async (editor) => {
    const write = editor.changePicker("blake");
    editor.refresh({ ...SAVED, scheduledFor: "2026-07-03" }, performance.now());
    await write;
    assert.equal(editor.state.night.scheduledFor, SAVED.scheduledFor);
    assert.equal(editor.state.night.pickerId, "blake");
  });
});

test("a refresh whose load started before a write doesn't undo it", async () => {
  await withEditor(backend(), async (editor) => {
    const loadStartedAt = performance.now();
    await editor.changePicker("blake");
    // The load read the Night before the write, then landed after it.
    editor.refresh(SAVED, loadStartedAt);
    assert.equal(editor.state.night.pickerId, "blake");
    // A load that starts after the write applies.
    editor.refresh({ ...SAVED, pickerId: "blake", scheduledFor: "2026-07-03" }, performance.now());
    assert.equal(editor.state.night.scheduledFor, "2026-07-03");
  });
});
