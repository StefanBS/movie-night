# Home "Up next" countdown card (#46)

Part of #28 · Phase 3 · handoff screen 3.

## Problem

The Tonight home (`app/(tabs)/index.tsx`) has one leading state today: the
`SpotlightHero` whose-turn card (#32). Now that a night can be scheduled for a
future date (#44/#45), the home should **lead with the scheduled night** when
one exists — a countdown card — and fall back to the whose-turn spotlight when
none does.

## Behavior

A new pure selector `nextScheduledNight(nights, today)` picks the **soonest**
night with `movie === null && daysUntil(scheduledFor, today) >= 0`:

- Returns a `Night` → the home leads with the **Up next card**.
- Returns `null` → the home leads with the existing `SpotlightHero` (#32).

`On deck` and the bottom rotation/plan link stay below in **both** states.

### Data source

A scheduled night is a `Night` with `movie === null`, `pickerId` set, and
`scheduledFor >= today`. These are already returned by `listNights` (the backend
`ListRecordedNights` query returns every picker-set night, future and past), so
**no new endpoint is needed**. The selector is fed by `listNights`.

The picker's name and the "coming" avatars both come straight off
`night.attendees` — the picker is a present core member, so
`attendees.find(a => a.id === night.pickerId)` resolves it (the pattern
`app/night/[id].tsx:39` already uses). No extra members fetch.

## Components

### `nextScheduledNight` selector — `lib/nights.ts`

```ts
nextScheduledNight(nights: Night[], today?: string): Night | null
```

Filters `movie === null && daysUntil(scheduledFor, today) >= 0`, returns the
element with the minimum `scheduledFor` (or `null`). `today` is injectable for
deterministic tests, mirroring `lib/date.ts`. Table-driven test in
`nights.test.ts` covering: empty input; only past nights; only movie-attached
future nights; a single future planned night; multiple (returns the soonest); a
night scheduled for today (`daysUntil === 0`, included).

### `UpNextCard` — new `components/UpNextCard.tsx`

Extracted to its own file (not inlined like `SpotlightHero`/`OnDeck`) because it
is sizeable and self-contained, and `index.tsx` is already ~290 lines. Exported
from `components/index.ts`.

Renders on `surface.dark` + `shadow.spotlight` (the rationed-ember spotlight —
the scheduled night *is* "next up"), with the same top ember wash as
`SpotlightHero`:

- Header row: `✦ NEXT MOVIE NIGHT` mono tag + a **solid-ember countdown pill**
  (`lucide-react-native` `Clock` icon + `countdownLabel(date)` uppercased,
  `colors.accent.base` fill, `text.onAccent` ink).
- Serif weekday + date via `formatWeekdayDate(date)` (e.g. *Friday, Jun 19*).
- A hairline-topped picker row: picker `Avatar` + "{name}'s pick" /
  "CHOOSES THE FILM THAT NIGHT" mono sub-line + up to 4 overlapping attendee
  avatars (`attendees.slice(0, 4)`, no overflow count — matches the prototype).
- Footer: **Start the night** (primary `AppButton`) + **Edit** (secondary),
  side by side.

Props: `{ night: Night; onStart: () => void; onEdit: () => void }`.

**Recurrence is omitted.** The prototype's `↻ Repeat` row is Phase 4
(#48/#49) and has no backing data on the `Night` model yet.

### Home wiring — `app/(tabs)/index.tsx`

- Fold a `listNights` call into the existing turn focus-effect via
  `Promise.all`, so `loading` gates both and the card never flashes in after the
  spotlight. A `listNights` failure degrades gracefully to the spotlight (the
  turn fetch still owns the screen's error state, as the group fetch does today).
- Derive `nextScheduledNight` from the fetched nights (via `useMemo`).
- Planned state: the skip-turn row drops, and the bottom link becomes
  **Plan another night →** (routes to `/night/new`). `On deck` stays.
- Spotlight state: unchanged.

### Routing

- **Start the night → `/night/new`.** The wizard resumes the latest open night
  via `getCurrentNight` + `deriveInitialStep` (tonight → *Who*, future →
  *Scheduled* confirmation). Reusing the existing resume path keeps #46 purely
  additive. Caveat: with multiple future planned nights, resume targets the
  *latest*, not the soonest — acceptable until #47 lets you target a night by id.
- **Edit → no-op placeholder**, wired in #47 (Edit night). Matches the existing
  precedent: the home's skip-turn button is already UI-only (`index.tsx:206`).

## Testing

- `nextScheduledNight` — table-driven unit test (cases above), no mocks.
- No new integration surface (no new endpoint; `listNights` is already covered).
- Manual: `just check` (lint + typecheck + test) green.

## Out of scope

- Edit/cancel flow (#47).
- Recurrence row + data (#48/#49).
- Targeting a specific night by id from "Start the night" (deferred to #47).
