# Night flow redesign — Who → Pick → Recorded (tonight-only)

Issue: [#35](https://github.com/StefanBS/movie-night/issues/35) · Part of [#28](https://github.com/StefanBS/movie-night/issues/28) (Phase 1, handoff screens 6–8 + 4a).

## Goal

Rebuild the legacy `mobile/app/night.tsx` (one flat "do everything" list) as a
**three-step wizard** with a stepper, **tonight-only**: **Who's here → The pick →
Recorded**. Wired entirely to the existing night/movie endpoints via
`lib/nights.ts` and `lib/movies.ts` — **no backend changes, no new endpoints, no
new shared components**. Done when the flow creates tonight's night, records
attendance + the pick, attaches a movie, and shows the recorded screen against
the seeded "Friday Film Club" group, with `just check` passing.

The prototype's **When** step and **Scheduled** branch (`screens-night.jsx`) are
Phase 3 — out of scope. The stepper therefore has three dots (Here · Pick · Done),
built so "When" can be prepended later.

## Architecture & files

- **Rewrite `app/night.tsx`** as the wizard container (Option A — single file).
  It owns all data (`members`, `night`, `order`) and UI state (`step`, `busy`,
  `actionError`, search state) and renders the shared chrome: a custom
  `TopBar` (kind `title`), a local `Stepper`, and a bottom-anchored CTA. The
  three step views are **local sub-components in the same file** — `WhoStep`,
  `PickStep`, `RecordedStep` — plus a local `Stepper`. This mirrors how
  `index.tsx` keeps `SpotlightHero`/`OnDeck` and `rotation.tsx` keeps
  `RotationList` local: these are screen-specific, not reusable primitives, so
  they stay out of `components/`. Expected size ~400–450 lines (in-band; the
  legacy file is 527).
  - **Safety valve:** if any single step view exceeds ~120 lines or the file
    passes ~500, extract that one step to `components/night/`. Start in one file.
- **New `lib/nightFlow.ts`** — the one piece of pure, branchable logic:
  `deriveInitialStep(night: Night): Step`. Keeps step-resolution out of JSX and
  unit-testable, matching the repo's "pure functions in `lib/`" convention.
- **New `lib/nightFlow.test.ts`** — table-driven cases for `deriveInitialStep`.
- **Edit `app/_layout.tsx`** — flip the `night` Stack screen to
  `headerShown: false` (the wizard supplies its own `TopBar`), exactly like the
  existing `rotation` / `member/*` entries.

No changes to `lib/nights.ts`, `lib/movies.ts`, `lib/turn.ts`, the backend, or
the `components/` library.

## Pure helper (table-driven unit test, no mocks)

`lib/nightFlow.ts`:

```ts
export type Step = "who" | "pick" | "recorded";

// deriveInitialStep maps a resumed night to the step the wizard should open on,
// so leaving and returning lands in the right place.
export function deriveInitialStep(night: Night): Step {
  if (night.movie !== null) return "recorded"; // movie attached → done
  if (night.pickerId !== null) return "pick";  // picker recorded, no movie yet
  return "who";                                 // fresh night
}
```

Test cases (`lib/nightFlow.test.ts`): movie present → `"recorded"`; movie null +
pickerId set → `"pick"`; movie null + pickerId null → `"who"`; movie present +
pickerId null (defensive) → `"recorded"`.

## Data flow & state

The container owns its data the same way the legacy screen does:

- **On mount** (`useEffect` + `AbortController`):
  `Promise.all([fetchMembers(API_URL, GROUP_ID), getCurrentNight(API_URL, GROUP_ID)])`.
  `fetchMembers` returns the **full roster** (core + guests + inactive) so anyone
  present can be toggled. If `getCurrentNight` returns a night, also call
  `getNightTurn(night.id)` and set `step = deriveInitialStep(night)`.
- `API_URL` / `GROUP_ID` resolved once via `resolveApiBaseUrl` + `lib/api`,
  identical to today.
- **`getNightTurn(nightId)`** returns the **present active-core** members in turn
  order — the backend's `nightTurnHandler` already passes the night's attendees
  as `RankGroupTurn`'s `present` set. So `order[0]` is the picker ("GETS THE
  PICK"); no client-side intersection needed.
- **Writes** go through the existing `runNightWrite(busyKey, write, fallback,
  clearOrder?)` envelope, reused verbatim: busy-guard against concurrent writes,
  adopt the returned `Night`, refresh the turn order, surface refresh failure
  separately, inline `actionError` banner on failure.

`step` is explicit React state (a `Step`), initialized from
`deriveInitialStep` on resume and advanced/retreated by the steps. Render states,
each mounting the `TopBar`:

1. **loading** — centered ember `ActivityIndicator`.
2. **load error** — centered line `Couldn't load tonight: <message>`.
3. **no open night** — the explicit-start intro (below).
4. **wizard** — the active `step`.

### No open night → explicit start

Per the agreed decision, navigating to `/night` does **not** auto-create a night.
When `getCurrentNight` returns `null`, show a small intro: a hint line + primary
`AppButton` **"Start tonight's night"** → `runNightWrite("create", () =>
createNight(API_URL, GROUP_ID, todayLocalISO()), …, clearOrder=true)`, then set
`step = "who"`. (Keeps today's behaviour; no DB row created merely by navigating.)

## The three steps

`Stepper({ labels, current })` — local component. Renders dots with connecting
hairlines; dots `< current` show `✓` filled ember, the current dot is ember, the
rest muted (port of the prototype `Stepper`). `labels = ["Here", "Pick", "Done"]`.

### 1. Who's here (`step === "who"`)

- `TopBar` kind `title`, title "New night", back **"Cancel"** → `router.back()`.
- Heading (serif) `Night of {scheduledFor}` (or "Tonight"); hint "Tap who made
  it. Tonight's pick goes to whoever's next up and here."
- `SectionLabel` "Who's here?" then the **full roster** as attendance rows: tap
  toggles `addAttendee`/`removeAttendee` (via `runNightWrite(member.id, …)`).
  Present rows are full-opacity on `surface.subtle`; absent rows dim (opacity).
- The **picker spotlight**: the row whose id === `order[0]?.id` gets the
  `surface.spotlight` + ember-border + `shadow.spotlight` treatment and a mono
  `GETS THE PICK` line under the name (the rationed ember = "whose turn").
- Bottom CTA `AppButton` **"Next — {firstName} picks →"** (`fullWidth`), disabled
  when `busy` or no present core picker (`order.length === 0`). On press: record
  the auto-picker `recordNightPick(order[0].id)` then `setStep("pick")`.

### 2. The pick (`step === "pick"`)

- `TopBar` kind `title`, title "The pick", back **"Here"** → `setStep("who")`.
- **Picker spotlight card**: `surface.spotlight` + ember border; mono `✦ PICKING
  TONIGHT`, picker name (serif) resolved from `night.pickerId` against `members`.
- **Correction affordance** (the "allow correcting" decision): a ghost
  `AppButton` **"Not {firstName}? Choose who picks"** toggles an inline list of
  **present attendees** (`night.attendees`, core + guests). Tapping a name calls
  `recordNightPick(id)` (via `runNightWrite`) and collapses the list. Hidden by
  default.
- `SectionLabel` "Find a film" + the `Input` (ember "Search" addon, `returnKeyType`
  search) → `searchMovies(API_URL, query)` into `results`; `searchError` inline.
- Results list: each row a `Poster` thumb (42×63) + serif title + mono year
  (`movieLabel`-style), tappable → `attachMovie(API_URL, GROUP_ID, night.id,
  tmdbId)` then `setStep("recorded")`. Selection is the action; **no bottom CTA**
  on this step.

### 3. Recorded (`step === "recorded"`)

- `TopBar` kind `title`, title "Tonight", **no back link** (use Change/Done).
- Centered hero column:
  - `Poster` **150×222** (real `night.movie.posterUrl`; falls back to the
    gradient tile with title when null, as `Poster` already handles).
  - `Badge` solid **"Recorded ✓"** (renders `RECORDED ✓`, uppercase).
  - Movie **title** in serif display (`textPresets.screenTitle`-scale),
    `text.primary`; **year** in mono (`night.movie.releaseYear`, omitted if null).
    (Runtime is not in the `Movie` model — year only; no fabricated runtime.)
  - "Picked by **{name}** · {date}" with an `sm` `Avatar`. Name from
    `night.pickerId`; date = `formatShortDate(night.scheduledFor)` (`lib/date`).
  - `SectionLabel` "Who watched" + an **overlapping avatar cluster** of all
    `night.attendees` (negative margin + ring, port of the prototype cluster).
- Bottom CTAs: primary `AppButton` **"Done — back to rotation"** →
  `router.back()`; a ghost `AppButton` **"Change movie"** → `setStep("pick")`
  (re-enters search; `attachMovie` overwrites on the next selection).

## Bottom CTA chrome

Steps 1 and 3 have a bottom-anchored action area (the prototype's fixed footer).
Implement as a flex column: scrollable content (`flex: 1`) above a footer `View`
padded for the safe-area bottom inset (`useSafeAreaInsets`). A subtle top-edge
fade is optional (`expo-linear-gradient` is already a dep via `Poster`); a solid
footer on `surface.page` is acceptable if the gradient adds noise. Step 2 has no
footer.

## Picker-recording semantics

- The pick is recorded on the **Who → Pick** transition (`recordNightPick`), which
  is what credits the turn (`is_credited`) and advances fairness standings — so it
  must happen; a movie alone does not credit a pick.
- Correction on **The pick** overrides `night.pickerId`.
- Going **back** to Who's here and forward again **re-asserts** `order[0]` (the
  current next-up present core member). This is predictable and acceptable for the
  happy path; documented rather than special-cased.

## Edge & error states

- **No present core member** on Who's here: no spotlight row, CTA disabled, hint
  shown.
- **Search**: empty query is a no-op; `searchError` rendered inline; results
  cleared on a successful `attachMovie`.
- **Write failures**: inline `actionError` banner (never blocks a succeeded
  write); all interactive controls disabled while `busy !== null`.
- **Movie with null poster / null year**: handled by `Poster` fallback and the
  year-omit branch.
- **Resume**: `deriveInitialStep` lands the wizard on the right step; the
  backend's single-open-night invariant + `getCurrentNight` keep resume
  unambiguous.

## Testing & verification

- **Pure logic**: table-driven `deriveInitialStep` cases in `lib/nightFlow.test.ts`
  (Node `node:test` via tsx, no mocks), matching repo convention.
- **No RN render tests** — the repo has none; UI is verified by running the app.
- Per `mobile/AGENTS.md`, confirm any v56 API used (safe-area insets,
  `expo-linear-gradient` if used) against <https://docs.expo.dev/versions/v56.0.0/>.
- **Gate**: `just check` (lint + typecheck + test) must pass.
- **Manual** (against seeded "Friday Film Club"): Start tonight → toggle
  attendance and see GETS THE PICK move to the next-up present member → advance,
  optionally correct the picker → search a film and select it → land on Recorded
  with poster, badge, title/year, picked-by, and the who-watched cluster → Done
  returns to Tonight; resume mid-flow lands on the correct step.

## Out of scope

- The **When** step and **Scheduled** future-night branch (Phase 3 scheduling).
- Skip-turn (#42) and any turn/endpoint changes.
- Reactions / who-loved-it (#40) and history (#36).
- Any new shared `components/` primitive or backend change.
