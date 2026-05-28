# ADR-0002 — Go + PostgreSQL backend, Expo (React Native) mobile, TMDB metadata

**Status:** Accepted (2026-05-28)

## Context
Scope is full-stack across three areas. The backend is a current strength; mobile
is new; UI is the weakest area. The group uses a mix of iOS and Android devices.
We want something usable on their phones early to keep the project alive.

## Decision
- Backend: **Go** with **PostgreSQL**.
- Mobile: **Expo (React Native)**.
- Movie metadata: **TMDB** API.
- Build in **vertical slices** (a thin thread through all layers) rather than
  completing layers horizontally.

## Rationale and alternatives
- *Go + Postgres:* Go is an existing strength, so only one new runtime (mobile) is
  being learned at a time. Postgres is chosen because relational data modeling is
  an explicit learning goal and the domain (group ↔ members ↔ picks ↔ reviews) is
  inherently relational.
- *Expo (React Native)* over Flutter or native: fastest path onto mixed-device
  phones (live testing via Expo Go, builds via EAS), a large component ecosystem to
  lean on while UI skills develop, and skills that transfer to web. Flutter is a
  reasonable alternative if UI craft later becomes the priority. Native
  (SwiftUI/Compose) was rejected as single-platform, which fights the mixed-device
  reality.
- *TMDB* over building a movie database: free, REST/JSON, and exposes watch-provider
  data so "where to stream" comes largely for free. Attribution is required.

## Consequences
- Clean decoupling: the Go service exposes a JSON API and the mobile app is a pure
  client.
- Two ecosystems (Go and JS/TS) to maintain.

---
[← Index](README.md)
