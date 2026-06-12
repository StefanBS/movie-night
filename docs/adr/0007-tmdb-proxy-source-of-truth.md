# ADR-0007 — Proxy TMDB through the backend; the server is the source of truth on attach

**Status:** Accepted (2026-06-10)

## Context
Attaching a movie to a night uses TMDB (ADR-0002). TMDB needs an API token and
requires attribution. The mobile app is a pure client (ADR-0002), and we want one
place that holds the token and one trusted shape for stored movie metadata.

## Decision
- The Go backend **proxies TMDB**: `GET /movies/search` performs the search
  server-side so the token (a v4 Read Access Token in `TMDB_READ_TOKEN`) never
  ships to the client, and attribution lives in one place. The phone never calls
  TMDB directly.
- On attach (`POST /groups/{gid}/nights/{nightId}/movie`), the client sends only a
  `tmdbId`. The backend **re-fetches canonical title/year from TMDB** `/movie/{id}`
  and is the source of truth; client-supplied metadata is never trusted for the
  stored record.
- `movies` is a **cache keyed by `tmdb_id`** (upsert refreshes title/year). A
  night references a cached movie via the nullable `picks.movie_id` (planned
  first, attached later).
- TMDB is **optional config**: with no token, search and attach return `503` and
  the rest of the app is unaffected.

## Consequences
- One trusted metadata shape; no client tampering with stored titles/years.
- The attach path depends on TMDB reachability (a deliberate trade for authority);
  failures surface as `502`, an unknown id as `404`.
- A second TMDB round-trip on attach (search already returned the data), accepted
  for correctness. Posters and watch-provider availability remain deferred
  (see [backlog.md](backlog.md)).

---
[← Index](README.md)
