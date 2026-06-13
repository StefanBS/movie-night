# Architecture Decision Records — Movie Night App

This directory records the key architecture decisions for a turn-based
movie-night app for a small, recurring group of friends. Each decision is its own
record under `docs/adr/NNNN-title.md` using a lightweight ADR format (context,
decision, consequences). Records are append-only: when a decision changes, add a
new record that supersedes the old one rather than editing history.

**Status legend:** Proposed · Accepted · Superseded · Deprecated
**Last updated:** 2026-06-10

## Index

- [ADR-0001](0001-build-dedicated-turn-based-app.md) — Build a dedicated turn-based movie-night app · *Accepted*
- [ADR-0002](0002-go-postgres-expo-tmdb-stack.md) — Go + PostgreSQL backend, Expo (React Native) mobile, TMDB metadata · *Accepted*
- [ADR-0003](0003-backend-source-of-truth-letterboxd-csv.md) — Own backend is the source of truth; Letterboxd via CSV import · *Accepted*
- [ADR-0004](0004-people-and-membership-roles.md) — Model members and guests as one people table with membership roles · *Accepted*
- [ADR-0005](0005-least-served-turn-ranking.md) — Determine whose turn it is with a "least-served" ranking · *Accepted*
- [ADR-0006](0006-membership-churn-handling.md) — Handle core-membership churn by deactivating, seeding, and crediting · *Accepted*
- [ADR-0007](0007-tmdb-proxy-source-of-truth.md) — Proxy TMDB through the backend; the server is the source of truth on attach · *Accepted*

Open and deferred decisions are tracked in [backlog.md](backlog.md).

## Data model reference (non-normative)

A snapshot of the entities these decisions imply. This is a reference, not a
schema definition.

- **users** — every human (core member or guest); optional Letterboxd handle.
- **groups** — a movie-night crew.
- **memberships** — person ↔ group link; `role` (core/guest), `status`
  (active/inactive), `baseline_picks`, `rotation_position`, join/leave timestamps.
- **picks** — one per movie night; references the group, the picker (a person; may
  be null for a free pick), and the chosen movie; carries `is_credited` and the
  scheduled date.
- **attendances** — who was present at a given night (linked to that night's pick).
- **movies** — metadata cached from TMDB.
- **reviews** — a person's rating/notes for a given night's pick.
- **watchlist_items** — a person's saved films, seeded by Letterboxd CSV import.
