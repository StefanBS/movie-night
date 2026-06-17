# The Club + Member profile + Add member

Issue: [#34](https://github.com/StefanBS/movie-night/issues/34) · Part of [#28](https://github.com/StefanBS/movie-night/issues/28) (Phase 1, handoff screens 11–13).

## Goal

Turn the placeholder **The Club** tab into the real members screen and add the two
pushed screens it leads to — **Member profile** and **Add member**. Done when:

- The Club tab renders real `/members` + `/turn` data in three sections (In
  rotation, Guests, Inactive), with rows that push to a profile.
- A member profile shows avatar/name/role/since, a Picks / Last pick / In line
  stats card, a picks-list placeholder, and a Deactivate/Promote/Reactivate footer.
- Add member creates a **core or guest** member by name via `POST /members`.

Phase-1 is normally "existing API only", but this slice makes two **small,
additive backend changes** (decided during brainstorming) so the Core/Guest
choice and the "since" line are real rather than faked: a `role` param on
`POST /members`, and `joined_at` on the member DTO. The per-member **picks
history** is the one gap left as a placeholder — it needs the larger Phase-2
history endpoint ([#39](https://github.com/StefanBS/movie-night/issues/39)).

## Backend changes (additive)

### `internal/db/query/members.sql` → `just sqlc`
- Add `m.joined_at` to the `SELECT` columns of **`ListGroupMembers`** and
  **`GetGroupMember`**. `InsertMembership` already returns `joined_at`.
- Regenerate `internal/db/` with `just sqlc` (generated code is DO NOT EDIT).

### `membership.go`
- `joinRequest` gains `Role string \`json:"role"\``.
- New pure **`validateJoin(req) (name, role string, err error)`**: trims name
  (required, same as today); role defaults to `"core"` when empty; otherwise must
  be exactly `"core"` or `"guest"` (else a 400-mapped error). Replaces the
  name-only `validateJoinName`.
- `joinMemberHandler` branches on role:
  - **core** — unchanged path: read `AverageServedCount` + `MaxRotationPosition`,
    insert with `role=core, status=active, baseline_picks=seedBaseline(avg, 0),
    rotation_position=maxPos+1`.
  - **guest** — insert with `role=guest, status=active, baseline_picks=0,
    rotation_position=0`; **skip** the avg/maxPos reads. Guests never enter the
    rotation, so the turn query (`role=core`) already excludes them and the
    seed/position values are inert.

### `roster.go`
- `memberResponse` gains `JoinedOn string \`json:"joinedOn"\``, formatted with
  `.Format("2006-01-02")` — the same date encoding the turn handler uses for
  `lastPickedOn`.
- `toMemberResponses` (list path) and `encodeMember` (create + the three
  transition endpoints) both populate it, so **every** member DTO carries
  `joinedOn` consistently. `GetGroupMember` now selects `joined_at`, so the
  transition handlers have it.

### Backend tests
- **Unit (pure, table-driven):** `validateJoin` — empty name → error; whitespace
  trimmed; role omitted → `"core"`; `"core"`/`"guest"` accepted; anything else →
  error. `seedBaseline` is unchanged.
- **Integration (`membership_integration_test.go`):** a guest join
  (`role:"guest"`) returns `role=guest` and the member does **not** appear in
  `GET /turn`; the role-omitted path still creates a core member that does. Assert
  `joinedOn` is present and well-formed on the create response.
- **Integration (`roster_integration_test.go`):** `GET /members` rows include a
  `joinedOn` date string.

## Mobile data layer (`lib/`) — the pure, tested core

Keeps branchy logic out of JSX and unit-testable, matching the repo's "pure
functions in `lib/`, table-driven tests, no mocks" convention.

### `lib/members.ts`
- `Member` gains **`joinedOn: string`**; `parseMember` validates it is a string
  (descriptive throw otherwise), same boundary-checking style as the other fields.
- `joinMember(baseUrl, groupId, name, role, signal)` gains a
  **`role: "core" | "guest"`** param and sends `{ name, role }`.
- `memberActions` and `transitionMember` are unchanged. (Transition responses now
  also carry `joinedOn`, which `parseMember` already requires — consistent.)

### `lib/club.ts` (new) + `lib/club.test.ts`
- **`buildClubSections(members, turn)`** → `{ inRotation: TurnMember[], guests:
  Member[], inactive: Member[] }`. `inRotation` is `turn` as-is (already ranked,
  active-core only); `guests` = members with `role==="guest" && status==="active"`;
  `inactive` = members with `status==="inactive"`.
- **`clubSummary(members, turn)`** → `"5 members · 4 in rotation"` (active member
  count · rotation length), with correct singular/plural.
- **`memberProfile(members, turn, id)`** → `{ member: Member, turn: TurnMember |
  null, rank: number | null }` — looks the member up in `members`, finds its
  `/turn` entry (and 1-based rank) if it is in the rotation, else nulls. Returns
  `null` when no member matches the id.

### `lib/date.ts`
- Add pure **`formatMonthYear(iso): string`** → `"2024-06-15"` → `"Jun 2024"`,
  hand-split (timezone-independent) like `formatShortDate`. Powers the "since" line.

## Screens

### `app/(tabs)/club.tsx` — The Club tab
Replaces the placeholder. Owns its data with **`useFocusEffect`** (not a one-shot
`useEffect`) so it refreshes after returning from Add member / a transition.
Fetches `/members` and `/turn` in parallel (`fetchMembers` + `fetchTurn`) under one
`AbortController`. Same three render states as `rotation.tsx` (loading spinner /
error line via `errorMessage` / empty), with the `TopBar` mounted in all states.

- `TopBar kind="tab"`, `title="The Club"`, `sub={clubSummary(members, turn)}`,
  `right={<AddBtn />}` where AddBtn is an `IconButton variant="accent"` (plus glyph)
  → `router.push("/member/new")`.
- **In rotation** (`SectionLabel`): `MemberRow` per `inRotation` entry — `rank`
  = index+1, `meta={pickerMeta(m)}`, rank 1 gets `right={<Badge label="Next up" />}`
  and the others a chevron; hairline dividers as in `rotation.tsx`.
- **Guests · not in rotation** (only if non-empty): rows with name + neutral
  `Badge` ("Guest"), no rank/meta.
- **Inactive** (only if non-empty): dimmed rows (reduced opacity), name only.
- Every row `onPress` → `router.push("/member/[id]")` with the member id.

### `app/member/[id].tsx` — Member profile (new pushed screen)
`useFocusEffect` fetches `/members` + `/turn`, then `memberProfile(...)` by the
route `id`. `TopBar kind="title"`, `back={{ label: "The Club", onPress: router.back }}`.
Loading/error/empty (member-not-found) states.

- Centered 76px `Avatar` (glow off), serif name, role `Badge` + mono "since
  `${formatMonthYear(member.joinedOn)}`".
- **Stats card** — three `Stat` tiles split by hairline dividers: **Picks**
  (`turn.servedCount`), **Last pick** (`formatShortDate(turn.lastPickedOn)`), **In
  line** (`#${rank}`, `accent`). When the member is **not** in the rotation
  (guest/inactive → `turn`/`rank` null), each value gracefully falls back to `—`.
  (Historical pick counts for inactive members need the Phase-2 stats/history
  endpoint; out of scope here.)
- **Picks list** — `SectionLabel` "`${firstName}'s picks`" + an **empty-state
  placeholder** ("Their picks will appear here", noting history lands with #39). No
  data source exists yet.
- **Footer** — a pinned action bar rendering one `AppButton` per
  `memberActions(member)` (Deactivate / Promote / Reactivate). On press →
  `transitionMember(...)` then `router.back()` (the Club refetches on focus). The
  primary action uses the secondary variant per the design.

### `app/member/new.tsx` — Add member (new pushed screen)
`TopBar kind="title"`, `title="Add member"`, `back={{ label: "The Club", ... }}`.
Local component state: `name` and `role` (`"core" | "guest"`, default `"core"`).

- `Input` with placeholder "e.g. Alex Rivera".
- `SectionLabel` "Join as" + a row of two **inline selectable cards** (bespoke to
  this screen — not promoted to `components/` yet, per build-as-we-go): Core
  ("Enters the pick rotation") and Guest ("Watches, never picks"). The selected
  card gets `surface.spotlight` + an ember inset border + a check glyph.
- Helper note: new core members start at zero picks (fairness copy from handoff).
- Footer `AppButton` "Add to the club", disabled while name is empty or a request
  is in flight → `joinMember(API_URL, GROUP_ID, name.trim(), role)` → on success
  `router.back()`; on failure an inline error line (`errorMessage`).

### Routing (`app/_layout.tsx`)
Register `member/[id]` and `member/new` as `Stack.Screen`s with
`headerShown:false` (both use the custom `TopBar`), matching how `rotation` is
registered. Add member is a **pushed screen** (not `presentation:"modal"`) to match
the handoff's `back="The Club"` and the existing pushed-screen pattern.

## Components touched
- **`IconButton`** — add `variant="accent"`: ember (`accent.base`) fill, white
  glyph, soft ember shadow. Its own doc comment already lists "the add-member plus"
  as an intended use; this realizes it.

No other shared primitives change — `MemberRow`, `Badge`, `Avatar`, `Stat`,
`Input`, `AppButton`, `SectionLabel`, `TopBar` are reused as-is.

## Error handling
Every screen uses the established triad: `AbortController` on the fetch, `try/catch`
with `errorMessage(e, "…")` for the error line, and a distinct empty state. Write
actions (`joinMember`, `transitionMember`) surface failures inline and do not
navigate on error.

## Testing
- **Backend:** `just check` + the integration additions above.
- **Mobile:** `just check` (lint + typecheck + test). New/updated:
  - `lib/members.test.ts` — `joinedOn` parsing (present/missing/wrong-type),
    `joinMember` sends `{ name, role }`.
  - `lib/club.test.ts` (new) — `buildClubSections`, `clubSummary`,
    `memberProfile` (in-rotation, guest, inactive, not-found).
  - `lib/date.test.ts` — `formatMonthYear`.
  - `lib/members.integration.test.ts` — `joinMember` with a role round-trips
    against the real local server.

## Out of scope
- Per-member **picks history** (placeholder only) → [#39](https://github.com/StefanBS/movie-night/issues/39).
- Historical stats for guests/inactive members (the `—` fallback).
- An ellipsis/overflow menu on the profile header (the footer carries the actions).
