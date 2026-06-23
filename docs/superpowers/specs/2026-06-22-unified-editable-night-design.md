# Unify Scheduled + Recorded into one editable Night

Part of #28 · Phase 3. Supersedes the Scheduled-vs-Recorded split introduced by #45; rescopes #47.

## The insight

A "night" is one row in `picks`: a **date** (`scheduled_for`), an optional **picker**, an optional **movie**, and **attendees**. There is no stored status — "Scheduled" and "Recorded" are labels the mobile UI *derives* from two questions: is the date in the future, and is a movie attached. Today that derivation is scattered across **three** presentations of the same entity:

- `components/night/ScheduledStep.tsx` — future terminal (date hero + countdown + locked picker; **not editable**, just "Done").
- `components/night/RecordedStep.tsx` — tonight/past terminal (film hero; lightly editable via "Change movie").
- `app/night/[id].tsx` — History detail (**read-only**).

The split is historical: the app began "tonight only," and scheduling (#28 Phase 3) bolted on a parallel terminal rather than rethinking what a night is. The fragmentation also blocked the original request — *you can't pick a film for a future night* — because "has a movie" is treated as the terminal "done" state.

## The model

A night has a **lifecycle, not a type**. It is the same row throughout: plan it (date, who, picker), optionally pick a film early, the night happens, confirm/adjust the film and who came. We collapse to **one adaptive, editable `NightView`** used everywhere — the wizard's terminal, and (later) the History detail. It frames itself by date (countdown + "who's coming" ahead; "watched on" + film-as-headline past) and shows the film as either *not-picked-yet → choose* or *the chosen film → change*. Picker and attendees stay editable regardless of when the night is.

The **wizard container becomes the single night editor**, parameterized by new-vs-existing. Edit actions reuse the existing steps (Change film → `PickStep`; edit roster / picker → `WhoStep`/`PickStep`) rather than rebuilding them.

## Backend reality (no changes for Stages 1–2)

Existing write endpoints cover: attach/change **movie** (`attachMovie`), set **picker** (`recordNightPick`), add/remove **attendees**. The backend already accepts a movie on a future-dated night (`attachMovie` sets `movie_id` with no date guard). What is **missing**, and gates Stage 3: **clear** a film back to undecided (detach), **change the date**, **cancel/delete** a night.

## Staging

Each stage is its own spec → plan → PR.

### Stage 1 — Unify the wizard terminals (existing endpoints only)

Replace `ScheduledStep` + `RecordedStep` with one `NightView`. Wizard flow becomes **When → Who → Pick (skippable) → NightView**, for both tonight and future nights:

- **Pick becomes skippable.** `PickStep` gains a footer affordance ("Decide on the night →" for a future night; "Skip for now →" for tonight) that advances to `NightView` with no movie. Selecting a film attaches it and advances to `NightView`. The hardcoded "✦ Picking tonight" copy becomes date-aware.
- **`onAdvance` always routes Who → Pick** (today it shortcuts a future night straight to Scheduled; that shortcut is removed). The Who footer becomes a uniform "Next — {name} picks →" (drops the future-only "Schedule —").
- **`onAttach` routes by date**, not unconditionally to a "recorded" terminal — both land on `NightView`.
- **`NightView`** (new `components/night/NightView.tsx`, presentational): adaptive hero (film poster+title when set, else date+countdown / "not picked yet"); the picker card; the attendees cluster; a footer "Done" + a "Change film" action that returns to `PickStep`. Replaces the two terminals in `app/night/new.tsx`.
- **Date-first helpers** (`lib/nightFlow.ts`, `lib/nights.ts`):
  - `deriveInitialStep` — a future, picker-locked night resumes to the Night terminal **whether or not** a movie is attached (today a movie wrongly sends it to Recorded).
  - `isResumable(night, today)` — a future night stays resumable even with a movie; only a **past/tonight** night with a movie is "done" (gains a `today` param).
  - `nextScheduledNight` — drop the strict `movie === null`; "upcoming scheduled" = `daysUntil > 0` **or** (`daysUntil === 0 && movie === null`). A future night with a pre-picked film still leads the home card.
- **Home "Up next" card** (`components/UpNextCard.tsx`) — when a film is set, surface it (poster/title) in place of "CHOOSES THE FILM THAT NIGHT".

Delivers the original ask: pick a film in advance, or skip.

### Stage 2 — Make History editable (existing endpoints only)

`app/night/[id].tsx` mounts the same `NightView` (read → write): tapping a past night from History lets you change film/picker/attendees via the same `PickStep`/`WhoStep` edit actions. Home "Start the night"/"Edit" route to the night **by id** (`/night/[id]`), which also resolves the #46 caveat (Start currently resumes the *latest* open night via `getCurrentNight`, not the *soonest* one the card shows). Replaces the read-only History detail.

### Stage 3 — Backend-gated edits (≈ #47)

Clear film (detach), change date, cancel/delete a night. New backend endpoints (Go handler + sqlc queries + migration if needed) plus the UI affordances. Deferred — this is the rescoped #47.

## Out of scope

- Recurrence / reminders / calendar export (Phases 4–5; #48–#51).
- History showing future planned nights as "Untitled night" — a pre-existing artifact of #45's `listNights` usage, untouched here.

## Testing

- Pure helpers (`deriveInitialStep`, `isResumable`, `nextScheduledNight`) — table-driven `node:test`, no mocks, `today` injected. New cases: future-night-with-movie resumes to the Night terminal and stays resumable; a today night with a movie is excluded from `nextScheduledNight`; a future night with a movie still surfaces.
- `NightView` and the wizard wiring — presentational, verified by `just check` (lint + typecheck + tests).
- No new backend surface in Stages 1–2.

## GitHub issues

- New **epic** issue (the model + the three stages as a checklist), linked under #28.
- New **Stage 1** and **Stage 2** issues.
- **#47** rescoped to Stage 3 (the backend-gated edits), cross-linking the epic.
- Note on #46/PR #72 that `nextScheduledNight` + the card evolve in Stage 1, so #72 can merge as-is for #46-as-specified.
