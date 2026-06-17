# History tab + Night detail — design

Date: 2026-06-17
Issue: #36 (Redesign P1.8) · Epic #28 · Phase 1, handoff screens 9–10
Parent spec: `docs/superpowers/specs/2026-06-16-spotlight-redesign-phase1-design.md`

## Goal

Replace the History tab placeholder with the full Spotlight History UI (stat
strip + nights grouped by month + per-night rows) and add the pushed Night
detail screen (`app/night/[id].tsx`). Wire only the **existing** backend API.

## Context / constraints

- **No nights-list endpoint yet** (→ #39). Only `GET /nights/current` and
  `GET /nights/{id}` exist. History therefore shows an **honest empty state**
  this phase; the full render path is built behind a loud seam so #39 only has
  to supply the array.
- **No reactions yet** (→ #40). The `Night` model is left unchanged — no
  reaction field, no glyph rendered anywhere this phase. The issue's "reaction
  glyph renders only when present" is satisfied by there being nothing present.
- **Picker name** resolves from `night.attendees` (the picker is always a
  present attendee), so this feature needs **no members fetch** anywhere.
- Follow the parent spec / CLAUDE.md: import all tokens from `theme/`, never
  hardcode; sentence case except mono tags; no emoji beyond `✓ → … ✦`.

## Architecture

### Routing change (align with the parent spec's target structure)

The parent spec's target routing is `app/night/new.tsx` + `app/night/[id].tsx`,
but #35 shipped the night flow as `app/night.tsx` (route `/night`). A file
`night.tsx` alongside a `night/` folder is the one ambiguous case in
expo-router, so:

- **Move** `app/night.tsx` → `app/night/new.tsx` (route `/night` → `/night/new`).
- **Update** the single caller `app/(tabs)/index.tsx` (`router.navigate("/night")`
  → `/night/new`).
- **Add** `app/night/[id].tsx`.

No logic in the flow changes — it is a file move plus one navigation string.

### `lib/history.ts` — pure logic (the testable substance)

```ts
type HistoryStats = { nights: number; films: number; loved: number };
type HistoryMonth = { label: string; nights: Night[] };

historyStats(nights: Night[]): HistoryStats
buildHistoryMonths(nights: Night[]): HistoryMonth[]
```

- `historyStats`: `nights` = `nights.length`; `films` = count of distinct
  `movie.tmdbId` among nights that have a movie; `loved` = `0` with a
  `// TODO(#40): count nights whose reaction === "loved"` comment (reactions do
  not exist yet).
- `buildHistoryMonths`: group nights by the month of `scheduledFor`, newest
  month first, nights within a month newest first. Month label via the existing
  `formatMonthYear` ("Jun 2026") — no new date code. Empty input → `[]`.
- Both pure → table-driven unit tests, no mocks (repo convention).

### `app/(tabs)/history.tsx` — the tab

Full render path built now, driven by `const nights: Night[] = []` behind a
loud `// TODO(#39): wire the nights-list endpoint` seam. This phase the array is
always empty, so the empty state is what renders live.

- `nights.length === 0` → honest empty state (`"No nights yet — start one."`),
  mirroring the club-tab empty pattern (`TopBar kind="tab"` + centered body text).
- Otherwise → `TopBar kind="tab" title="History"`, a stat strip of three `Stat`
  cells (Nights / Films / Loved, "Loved" `accent`) styled like the member
  profile's `StatsCard`, then per-month sections (`SectionLabel` label + rows).
- **Row** (inline; not reused, so no new component): `Poster` (small) + serif
  title + year + picker first name + `formatShortDate(scheduledFor)`, pressable
  → `router.push({ pathname: "/night/[id]", params: { id } })`. No reaction
  glyph this phase (`// TODO(#40)`).

### `app/night/[id].tsx` — night detail (fully live)

- Reads `id` via `useLocalSearchParams`, fetches `getNight(API_URL, GROUP_ID, id)`
  in a `useFocusEffect` with an `AbortController` (same shape as the club tab).
- States: loading spinner, error text, not-found (null night) honest message.
- `TopBar kind="title"` with a back action; `ScrollView` body.
- Sections mirror `RecordedStep`'s visual vocabulary (consistency, not shared code):
  - **Editorial header**: large `Poster` + serif title + year. Reaction omitted
    (`// TODO(#40)`).
  - **"The pick"** spotlight row: ember `surface.spotlight` card + ember border +
    `shadow.spotlight`, picker `Avatar` (glow) + name + `formatShortDate`.
  - **"Who watched"**: `SectionLabel` + attendee list (`Avatar` + name; guests
    carry a neutral `Badge`).
- Picker/attendee names come straight from the `Night` payload — no members fetch.

## Error handling

- Night detail: network/parse failure → `errorMessage(e, "failed to load night")`
  rendered as centered danger text; `null` night → "Couldn't find that night."
- History: no fetch this phase, so no error path until #39.

## Testing

- `lib/history.test.ts` — table-driven, no mocks: `historyStats` (counts, film
  dedup by `tmdbId`, nights without a movie, `loved === 0`) and
  `buildHistoryMonths` (single month, multi-month ordering, within-month order,
  empty input).
- Screens: `just check` (lint + typecheck + test). Night detail is reachable by
  direct route now; History rows become reachable once #39 wires the list.

## Out of scope (visible seams)

- Nights-list endpoint + History data wiring → #39.
- Reactions (model field, glyphs, real "Loved" count) → #40.

## Build order

1. Routing move (`night.tsx` → `night/new.tsx`, update caller).
2. `lib/history.ts` + `lib/history.test.ts`.
3. `app/night/[id].tsx`.
4. `app/(tabs)/history.tsx`.
5. `just check`.
