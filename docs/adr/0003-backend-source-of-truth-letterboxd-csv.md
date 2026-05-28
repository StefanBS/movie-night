# ADR-0003 — Own backend is the source of truth; Letterboxd via CSV import

**Status:** Accepted (2026-05-28)

## Context
We want Letterboxd-style watchlists and reviews, and ideally direct integration.
However, Letterboxd has no open public API: access is request-only, can take months,
and is not guaranteed. Letterboxd does provide per-user CSV export of watchlist and
diary data with no approval required.

## Decision
Treat our own backend as the source of truth for watchlists, picks, and reviews.
Integrate Letterboxd through **CSV import** as an optional on-ramp so members can
bootstrap their data. Apply for the official API in parallel, and treat any real API
integration as a future enhancement — never a dependency or a critical path.

## Consequences
- No critical path is blocked on an external approval we do not control.
- Building our own watchlist/review store is itself central to the data-modeling
  learning goal.
- CSV import is manual and one-directional. Full two-way Letterboxd sync depends on
  API access that may never be granted.

---
[← Index](README.md)
