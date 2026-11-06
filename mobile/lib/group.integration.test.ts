import { test } from "node:test";
import assert from "node:assert/strict";

import { createGroupSession, fetchGroup, renameGroup, type Group } from "./group";
import { startServer } from "./testServer";

const GROUP = "11111111-1111-1111-1111-111111111111";

test("fetchGroup requests the group path and returns the parsed group", async () => {
  const group: Group = { name: "Friday Film Club", createdOn: "2026-05-01" };
  let requestedPath = "";
  let method = "";
  const server = await startServer((req, res) => {
    requestedPath = req.url ?? "";
    method = req.method ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(group));
  });
  try {
    const got = await fetchGroup(server.url, GROUP);
    assert.equal(method, "GET");
    assert.equal(requestedPath, `/groups/${GROUP}`);
    assert.deepEqual(got, group);
  } finally {
    await server.close();
  }
});

test("renameGroup PATCHes {name} to the group path and returns the updated group", async () => {
  const updated: Group = { name: "Saturday Cinema", createdOn: "2026-05-01" };
  let method = "";
  let path = "";
  let body = "";
  const server = await startServer((req, res, reqBody) => {
    method = req.method ?? "";
    path = req.url ?? "";
    body = reqBody;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(updated));
  });
  try {
    const got = await renameGroup(server.url, GROUP, "Saturday Cinema");
    assert.equal(method, "PATCH");
    assert.equal(path, `/groups/${GROUP}`);
    assert.deepEqual(JSON.parse(body), { name: "Saturday Cinema" });
    assert.deepEqual(got, updated);
  } finally {
    await server.close();
  }
});

test("fetchGroup throws on a non-2xx response", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 404;
    res.end("nope");
  });
  try {
    await assert.rejects(fetchGroup(server.url, GROUP), /request failed: 404/);
  } finally {
    await server.close();
  }
});

test("renameGroup surfaces the backend error message on a non-2xx", async () => {
  const server = await startServer((_req, res) => {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "name is required" }));
  });
  try {
    await assert.rejects(renameGroup(server.url, GROUP, ""), /name is required/);
  } finally {
    await server.close();
  }
});

test("the group session loads the group once, and a failed load retries on the next call", async () => {
  const group: Group = { name: "Friday Film Club", createdOn: "2026-05-01" };
  let up = false;
  let hits = 0;
  const server = await startServer((_req, res) => {
    hits++;
    res.statusCode = up ? 200 : 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(up ? group : { error: "boom" }));
  });
  const session = createGroupSession({ baseUrl: server.url, groupId: GROUP });
  try {
    await session.load();
    assert.deepEqual(session.state, { group: null, error: "boom" });

    up = true;
    // Two screens focusing at once share one request.
    await Promise.all([session.load(), session.load()]);
    assert.deepEqual(session.state, { group, error: null });
    assert.equal(hits, 2);

    await session.load();
    assert.equal(hits, 2, "a loaded group isn't fetched again");
  } finally {
    session.dispose();
    await server.close();
  }
});

test("the group session takes a rename's reply in place of the load", async () => {
  const renamed: Group = { name: "Saturday Cinema", createdOn: "2026-05-01" };
  const server = await startServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ name: "Friday Film Club", createdOn: "2026-05-01" }));
  });
  const session = createGroupSession({ baseUrl: server.url, groupId: GROUP });
  try {
    // A rename that lands while the launch load is in flight wins over it.
    const loading = session.load();
    session.set(renamed);
    await loading;
    assert.deepEqual(session.state, { group: renamed, error: null });
  } finally {
    session.dispose();
    await server.close();
  }
});

test("the group session's refresh picks up a rename from another phone", async () => {
  let name = "Friday Film Club";
  let up = true;
  let hits = 0;
  const server = await startServer((_req, res) => {
    hits++;
    res.statusCode = up ? 200 : 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(up ? { name, createdOn: "2026-05-01" } : { error: "boom" }));
  });
  const session = createGroupSession({ baseUrl: server.url, groupId: GROUP });
  try {
    await session.load();
    name = "Saturday Cinema";
    await session.load();
    assert.equal(session.state.group?.name, "Friday Film Club", "load alone keeps the loaded group");

    // Foregrounding twice in quick succession shares one request.
    await Promise.all([session.refresh(), session.refresh()]);
    assert.equal(session.state.group?.name, "Saturday Cinema");
    assert.equal(hits, 2);

    up = false;
    await session.refresh();
    assert.equal(session.state.group?.name, "Saturday Cinema", "a failed refresh keeps the last group");
    assert.equal(session.state.error, "boom");
  } finally {
    session.dispose();
    await server.close();
  }
});

test("the group session keeps a rename's reply over a refresh that started before it", async () => {
  const server = await startServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ name: "Friday Film Club", createdOn: "2026-05-01" }));
  });
  const session = createGroupSession({ baseUrl: server.url, groupId: GROUP });
  try {
    await session.load();
    const refreshing = session.refresh();
    session.set({ name: "Saturday Cinema", createdOn: "2026-05-01" });
    await refreshing;
    assert.equal(session.state.group?.name, "Saturday Cinema");
  } finally {
    session.dispose();
    await server.close();
  }
});
