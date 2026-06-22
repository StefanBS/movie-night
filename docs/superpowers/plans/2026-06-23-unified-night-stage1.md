# Unified Night — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the night wizard flow When → Who → Pick (skippable) → one editable Night terminal, so a future night can have a film set in advance or skipped, and "Scheduled"/"Recorded" become one adaptive screen.

**Architecture:** Replace `ScheduledStep` + `RecordedStep` with one presentational `NightView` that frames itself by date. The wizard's step union collapses its two terminals into a single `"night"` step. Three pure helpers (`deriveInitialStep`, `isResumable`, `nextScheduledNight`) move to date-first logic so a future night with a film is still "scheduled" everywhere. The home `UpNextCard` surfaces a pre-picked film. No backend changes.

**Tech Stack:** Expo SDK 56 / React Native, TypeScript, `node:test` via `tsx` (table-driven, no mocks), `react-native-svg`, `lucide-react-native`.

**User decisions (already made):**
- Pick stays in the wizard as a real, **skippable** step (user: "I want the wizard to include the pick screen"; "let the pick be skipped, but we have to have the option to set it right away too").
- Collapse Scheduled + Recorded into **one editable Night** concept (user approved; nights are "a lifecycle, not a type").
- Stage it: this is Stage 1 (wizard terminals only); History editing is Stage 2; backend-gated edits are Stage 3 (#47).
- Home card reflects a pre-picked film.

---

## File structure

- `lib/nights.ts` / `lib/nights.test.ts` — `nextScheduledNight` predicate widened (Task 1).
- `components/night/NightView.tsx` (new) + `components/night/index.ts` — the unified terminal (Task 2).
- `components/night/PickStep.tsx` — gains optional skip + date-aware copy (Task 3).
- `components/UpNextCard.tsx` — shows a set film (Task 4).
- `lib/nightFlow.ts` / `lib/nightFlow.test.ts`, `app/night/new.tsx`, `components/night/WhoStep.tsx`, `components/night/index.ts`; delete `ScheduledStep.tsx` + `RecordedStep.tsx` — the flow switch (Task 5).

Tasks 1–4 are independent and each leave `just check` green on their own (new props are optional; the new component is an unused export until Task 5 wires it). Task 5 is the atomic flip that renames the step union and rewires the container; it depends on Tasks 2 and 3.

---

### Task 1: Widen `nextScheduledNight` to keep future nights with a film

**Goal:** A future night with a film attached still counts as the next scheduled night; only a *past* night, or *today's* night once it has a film (recorded/done), is excluded.

**Files:**
- Modify: `mobile/lib/nights.ts` (the `nextScheduledNight` body + comment)
- Test: `mobile/lib/nights.test.ts` (flip one case, add one, fix the composite)

**Acceptance Criteria:**
- [ ] A strictly-future night counts whether or not it has a film.
- [ ] Today's night counts only when it has no film; once a film is attached it's excluded (recorded).
- [ ] Past nights are still excluded; the soonest qualifying night is returned; empty → null.

**Verify:** `cd mobile && node --import tsx --test lib/nights.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Update the three affected tests** in `mobile/lib/nights.test.ts`.

Replace this test:

```ts
test("nextScheduledNight ignores future nights with a movie attached", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-26", { movie: aMovie })], TODAY), null);
});
```

with:

```ts
test("nextScheduledNight includes a future night with a movie attached", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-26", { movie: aMovie })], TODAY)?.id, "n1");
});

test("nextScheduledNight excludes today's night once it has a movie", () => {
  assert.equal(nextScheduledNight([night("n1", TODAY, { movie: aMovie })], TODAY), null);
});
```

Replace this test:

```ts
test("nextScheduledNight skips past/recorded and picks the soonest upcoming planned", () => {
  const n = nextScheduledNight(
    [
      night("past", "2026-06-10", { movie: aMovie }),
      night("recorded-future", "2026-06-28", { movie: aMovie }),
      night("planned", "2026-07-01"),
    ],
    TODAY,
  );
  assert.equal(n?.id, "planned");
});
```

with:

```ts
test("nextScheduledNight skips past, keeps future with or without a film, soonest first", () => {
  const n = nextScheduledNight(
    [
      night("past", "2026-06-10", { movie: aMovie }),     // excluded: past
      night("planned", "2026-07-01"),                      // future, no film
      night("prepicked", "2026-06-28", { movie: aMovie }), // future, film → included, sooner
    ],
    TODAY,
  );
  assert.equal(n?.id, "prepicked");
});
```

- [ ] **Step 2: Run the tests to confirm the three above FAIL** (old behavior excluded future-with-film).

Run: `cd mobile && node --import tsx --test lib/nights.test.ts`
Expected: FAIL on the new/changed `nextScheduledNight` cases.

- [ ] **Step 3: Widen the predicate** in `mobile/lib/nights.ts`. Replace the whole `nextScheduledNight` function (and its lead comment) with:

```ts
// nextScheduledNight is the home's named selector: the soonest upcoming night,
// or null when none. "Upcoming" = strictly future (with or without a film yet —
// a film can be pre-picked for a scheduled night), or today while still
// film-less; today's night once a film is attached is recorded (done) and drops
// out. Fed by listNights; drives the "Up next" card, with the spotlight as the
// null fallback. ISO YYYY-MM-DD compares chronologically as text (like
// history.ts). `today` is injectable for deterministic tests (mirrors date.ts).
export function nextScheduledNight(
  nights: Night[],
  today: string = todayLocalISO(),
): Night | null {
  let soonest: Night | null = null;
  for (const n of nights) {
    const d = daysUntil(n.scheduledFor, today);
    if (d < 0) continue; // already past
    if (d === 0 && n.movie !== null) continue; // tonight, already recorded → done
    if (soonest === null || n.scheduledFor < soonest.scheduledFor) {
      soonest = n;
    }
  }
  return soonest;
}
```

- [ ] **Step 4: Run the tests to confirm all PASS.**

Run: `cd mobile && node --import tsx --test lib/nights.test.ts`
Expected: PASS (all `nextScheduledNight` + the unchanged parse cases).

- [ ] **Step 5: Commit.**

```bash
git add mobile/lib/nights.ts mobile/lib/nights.test.ts
git commit -m "nextScheduledNight keeps future nights with a pre-picked film (#74)"
```

---

### Task 2: `NightView` — the unified, adaptive night terminal

**Goal:** One presentational component that renders any night — film hero when a film is set, date hero + countdown when not — with the picker, attendees, and a "Done" + film action. Replaces `ScheduledStep` and `RecordedStep`.

**Files:**
- Create: `mobile/components/night/NightView.tsx`
- Modify: `mobile/components/night/index.ts` (add the export)

**Acceptance Criteria:**
- [ ] With a film set: poster + title + year hero, badge "Scheduled ✓" when the date is future else "Recorded ✓".
- [ ] With no film: weekday + date hero, badge "Scheduled ✓".
- [ ] Future nights show a countdown row; the picker and attendees render; the footer has "Done" + a film action labelled "Change film" (film set) or "Choose the film now →" (no film), calling `onPickFilm`.
- [ ] Uses only theme tokens.

**Verify:** `cd mobile && just typecheck && just lint` → both pass. (Presentational RN component; no unit test — pure logic lives in `lib/`.)

**Steps:**

- [ ] **Step 1: Create `mobile/components/night/NightView.tsx`:**

```tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";

import { AppButton, Avatar, Badge, Poster, SectionLabel } from "../";
import { WizardFooter } from "./WizardFooter";
import { countdownLabel, daysUntil, formatShortDate, weekday } from "../../lib/date";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  shadow,
  space,
  textPresets,
  trackPx,
} from "../../theme";

// NightView is the unified night terminal — one editable view for a night
// whatever its date or completeness. It frames by date: a future night leads
// with a date hero + countdown ("Scheduled ✓"); a tonight/past night with a
// film leads with the film poster ("Recorded ✓"). The film shows when set, with
// a "Change film" action; when unset, "Choose the film now". The picker and
// attendees render; editing the film re-enters PickStep. Replaces ScheduledStep
// + RecordedStep. `today` is passed in (mirrors lib/date.ts) for deterministic
// date framing.
export function NightView({
  night,
  members,
  today,
  onDone,
  onPickFilm,
}: {
  night: Night;
  members: Member[];
  today: string;
  onDone: () => void;
  onPickFilm: () => void;
}) {
  const future = daysUntil(night.scheduledFor, today) > 0;
  const movie = night.movie;
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {movie !== null ? (
          <View style={styles.filmHero}>
            <Poster uri={movie.posterUrl} title={movie.title} w={150} h={222} />
            <View style={styles.badgeWrap}>
              <Badge label={future ? "Scheduled ✓" : "Recorded ✓"} tone="solid" />
            </View>
            <Text style={styles.filmTitle} numberOfLines={3}>
              {movie.title}
            </Text>
            {movie.releaseYear !== null ? (
              <Text style={styles.filmYear}>{movie.releaseYear}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.dateHero}>
            <Badge label="Scheduled ✓" tone="solid" />
            <Text style={styles.heroWeekday} allowFontScaling={false}>
              {weekday(night.scheduledFor, true)}
            </Text>
            <Text style={styles.heroDate} allowFontScaling={false}>
              {formatShortDate(night.scheduledFor)}
            </Text>
          </View>
        )}

        {future ? (
          <View style={styles.countdownRow}>
            <Clock size={13} color={colors.accent.strong} />
            <Text style={styles.countdown} allowFontScaling={false}>
              {countdownLabel(night.scheduledFor)}
            </Text>
          </View>
        ) : null}

        <SectionLabel>{future ? "On the night" : "The pick"}</SectionLabel>
        <View style={styles.pickerRow}>
          <Avatar name={pickerName} size={40} glow />
          <View style={styles.pickerText}>
            <Text style={styles.pickerName} numberOfLines={1}>
              {future ? `${pickerName} picks` : pickerName}
            </Text>
            <Text style={styles.pickerSub} allowFontScaling={false}>
              {future ? "CHOOSES THE FILM THAT NIGHT" : `PICKED · ${formatShortDate(night.scheduledFor)}`}
            </Text>
          </View>
          <Badge label="✦ Up" uppercase={false} />
        </View>

        <SectionLabel>{future ? `Coming · ${night.attendees.length}` : "Who watched"}</SectionLabel>
        <View style={styles.cluster}>
          {night.attendees.map((a, i) => (
            <View key={a.id} style={[styles.clusterAvatar, i > 0 && styles.clusterOverlap]}>
              <Avatar name={a.name} size={40} />
            </View>
          ))}
        </View>
      </ScrollView>
      <WizardFooter>
        <AppButton title="Done" fullWidth onPress={onDone} />
        <View style={styles.filmActionRow}>
          <AppButton
            title={movie !== null ? "Change film" : "Choose the film now  →"}
            variant="ghost"
            onPress={onPickFilm}
          />
        </View>
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  filmHero: { alignItems: "center", paddingTop: space[2] },
  badgeWrap: { marginTop: space[5] },
  filmTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: trackPx(34, "display"),
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  filmYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  dateHero: {
    marginTop: space[3],
    paddingVertical: space[6],
    paddingHorizontal: space[6],
    borderRadius: radius.xl,
    backgroundColor: colors.surface.dark,
    alignItems: "center",
    ...shadow.spotlight,
  },
  heroWeekday: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: trackPx(40, "display"),
    color: colors.text.primary,
    marginTop: space[4],
  },
  heroDate: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    letterSpacing: trackPx(24, "display"),
    color: colors.text.secondary,
    marginTop: space[1],
  },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: space[1], marginTop: space[4] },
  countdown: { ...textPresets.tag, color: colors.accent.strong },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pickerText: { flex: 1 },
  pickerName: { fontFamily: fontFamily.sansSemibold, fontSize: fontSize.base, color: colors.text.primary },
  pickerSub: { ...textPresets.tag, color: colors.text.secondary, marginTop: space[1] },
  cluster: { flexDirection: "row", paddingTop: space[2] },
  clusterAvatar: { borderRadius: radius.full, borderWidth: borderWidth.regular, borderColor: colors.surface.page },
  clusterOverlap: { marginLeft: -space[2] },
  filmActionRow: { alignItems: "center" },
});
```

- [ ] **Step 2: Export it** — in `mobile/components/night/index.ts`, add after the `PickStep` line:

```ts
export { NightView } from "./NightView";
```

- [ ] **Step 3: Verify.**

Run: `cd mobile && just typecheck && just lint`
Expected: both pass.

- [ ] **Step 4: Commit.**

```bash
git add mobile/components/night/NightView.tsx mobile/components/night/index.ts
git commit -m "NightView — the unified, adaptive night terminal (#74)"
```

---

### Task 3: Make `PickStep` skippable and date-aware

**Goal:** `PickStep` can be entered for a future night with a "decide later" skip and date-appropriate copy, without changing its current tonight behavior.

**Files:**
- Modify: `mobile/components/night/PickStep.tsx`

**Acceptance Criteria:**
- [ ] Two new **optional** props: `future?: boolean` (default `false`) and `onSkip?: () => void`.
- [ ] The "✦ Picking tonight" tag reads "✦ Picking ahead" when `future` is true.
- [ ] When `onSkip` is provided, a footer button shows ("Decide on the night →" when future, else "Skip for now →") and calls `onSkip`; when absent, no footer renders (current behavior).
- [ ] With neither prop passed, the component behaves exactly as today.

**Verify:** `cd mobile && just typecheck && just lint` → both pass.

**Steps:**

- [ ] **Step 1: Add the props.** In `mobile/components/night/PickStep.tsx`, extend the destructured props and the type. Change the signature block:

```tsx
export function PickStep({
  night,
  members,
  busy,
  changingPicker,
  setChangingPicker,
  movieQuery,
  setMovieQuery,
  results,
  searching,
  searchError,
  onSearch,
  onAttach,
  onRecordPicker,
}: {
```

to add `future` and `onSkip`:

```tsx
export function PickStep({
  night,
  members,
  busy,
  future = false,
  changingPicker,
  setChangingPicker,
  movieQuery,
  setMovieQuery,
  results,
  searching,
  searchError,
  onSearch,
  onAttach,
  onRecordPicker,
  onSkip,
}: {
```

and in the prop type, add the two optional fields (after `busy: string | null;` and at the end before the closing brace):

```tsx
  night: Night;
  members: Member[];
  busy: string | null;
  future?: boolean;
  changingPicker: boolean;
  setChangingPicker: (v: boolean) => void;
  movieQuery: string;
  setMovieQuery: (v: string) => void;
  results: Movie[];
  searching: boolean;
  searchError: string | null;
  onSearch: () => void;
  onAttach: (tmdbId: number) => void;
  onRecordPicker: (memberId: string) => void;
  onSkip?: () => void;
}) {
```

- [ ] **Step 2: Make the tag date-aware.** Change:

```tsx
            <Text style={styles.pickingTag}>{"✦ Picking tonight"}</Text>
```

to:

```tsx
            <Text style={styles.pickingTag}>{future ? "✦ Picking ahead" : "✦ Picking tonight"}</Text>
```

- [ ] **Step 3: Add the skip footer.** `PickStep` currently ends its `<View style={styles.flex}>` right after the `</ScrollView>`. Import `WizardFooter` and render a footer when `onSkip` is set. Add to the imports at the top (next to the other `./` imports):

```tsx
import { WizardFooter } from "./WizardFooter";
```

Then change the end of the component from:

```tsx
        ))}
      </ScrollView>
    </View>
  );
}
```

to:

```tsx
        ))}
      </ScrollView>
      {onSkip ? (
        <WizardFooter>
          <AppButton
            title={future ? "Decide on the night  →" : "Skip for now  →"}
            variant="ghost"
            onPress={onSkip}
            disabled={busy !== null}
          />
        </WizardFooter>
      ) : null}
    </View>
  );
}
```

(`AppButton` is already imported in PickStep.)

- [ ] **Step 4: Verify.**

Run: `cd mobile && just typecheck && just lint`
Expected: both pass.

- [ ] **Step 5: Commit.**

```bash
git add mobile/components/night/PickStep.tsx
git commit -m "PickStep: optional skip + date-aware copy for scheduled nights (#74)"
```

---

### Task 4: `UpNextCard` surfaces a pre-picked film

**Goal:** When a scheduled night already has a film, the home card shows the film title instead of "Chooses the film that night".

**Files:**
- Modify: `mobile/components/UpNextCard.tsx`

**Acceptance Criteria:**
- [ ] When `night.movie` is set, the picker row sub-line shows the film title (sans, not the mono uppercase tag).
- [ ] When `night.movie` is null, the sub-line is the existing "Chooses the film that night".
- [ ] Theme tokens only.

**Verify:** `cd mobile && just typecheck && just lint` → both pass.

**Steps:**

- [ ] **Step 1: Branch the sub-line.** In `mobile/components/UpNextCard.tsx`, replace:

```tsx
            <Text style={styles.pickerMeta} allowFontScaling={false}>
              {"Chooses the film that night"}
            </Text>
```

with:

```tsx
            {night.movie !== null ? (
              <Text style={styles.pickerFilm} numberOfLines={1}>
                {night.movie.title}
              </Text>
            ) : (
              <Text style={styles.pickerMeta} allowFontScaling={false}>
                {"Chooses the film that night"}
              </Text>
            )}
```

- [ ] **Step 2: Add the `pickerFilm` style.** In the `StyleSheet.create({...})` block, add next to `pickerMeta`:

```tsx
  pickerFilm: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
    marginTop: space[1],
  },
```

- [ ] **Step 3: Verify.**

Run: `cd mobile && just typecheck && just lint`
Expected: both pass.

- [ ] **Step 4: Commit.**

```bash
git add mobile/components/UpNextCard.tsx
git commit -m "UpNextCard: show a pre-picked film on the home card (#74)"
```

---

### Task 5: Flip the wizard to Pick-always + the unified `NightView` terminal

**Goal:** The wizard's two terminal steps collapse to one `"night"` step rendering `NightView`; Who always advances to Pick; Pick can skip to the terminal; date-first helpers keep a future night-with-film "scheduled" and resumable.

**Files:**
- Modify: `mobile/lib/nightFlow.ts`
- Test: `mobile/lib/nightFlow.test.ts`
- Modify: `mobile/app/night/new.tsx`
- Modify: `mobile/components/night/WhoStep.tsx`
- Modify: `mobile/components/night/index.ts` (drop the two old exports)
- Delete: `mobile/components/night/ScheduledStep.tsx`, `mobile/components/night/RecordedStep.tsx`

**Acceptance Criteria:**
- [ ] `Step` is `"when" | "who" | "pick" | "night"`. `deriveInitialStep` returns `"night"` for a film-set night OR a future picker-locked night; else `"who"`. `isResumable(night, today)` is true for any future night and for a film-less tonight/past night.
- [ ] `onAdvance` (Who) always goes to `"pick"`; `onAttach` (Pick) goes to `"night"`; a Pick skip goes to `"night"` with no film; `NightView`'s film action returns to `"pick"`.
- [ ] The Who footer button reads "Next — {name} picks →" for both tonight and future.
- [ ] `ScheduledStep`/`RecordedStep` are deleted and no longer exported or imported.

**Verify:** `cd mobile && just check` → lint + typecheck + tests all pass.

**Steps:**

- [ ] **Step 1: Update the helper tests** in `mobile/lib/nightFlow.test.ts`. Replace the `cases` array and the `isResumable` test with:

```ts
const cases: [string, Night, Step][] = [
  ["movie attached → night", night({ movie }), "night"],
  ["future + picker → night", night({ scheduledFor: "2026-06-27", pickerId: "p1" }), "night"],
  ["future + picker + movie → night", night({ scheduledFor: "2026-06-27", pickerId: "p1", movie }), "night"],
  ["future + no picker → who", night({ scheduledFor: "2026-06-27" }), "who"],
  ["tonight + picker (no movie) → who", night({ pickerId: "p1" }), "who"],
  ["tonight + no picker → who", night({}), "who"],
  ["past + picker (no movie) → who", night({ scheduledFor: "2026-06-10", pickerId: "p1" }), "who"],
  ["movie present even with no picker → night", night({ movie, pickerId: null }), "night"],
];

for (const [name, n, expected] of cases) {
  test(`deriveInitialStep: ${name}`, () => {
    assert.equal(deriveInitialStep(n, TODAY), expected);
  });
}

test("isResumable: future stays resumable even with a film; past/tonight done once filmed", () => {
  assert.equal(isResumable(night({}), TODAY), true); // tonight, no film
  assert.equal(isResumable(night({ movie }), TODAY), false); // tonight, filmed → done
  assert.equal(isResumable(night({ scheduledFor: "2026-06-27", pickerId: "p1" }), TODAY), true); // future, no film
  assert.equal(isResumable(night({ scheduledFor: "2026-06-27", movie }), TODAY), true); // future, filmed
  assert.equal(isResumable(night({ scheduledFor: "2026-06-10", movie }), TODAY), false); // past, filmed → done
});
```

- [ ] **Step 2: Run the helper tests to confirm they FAIL** (old code returns "recorded"/"scheduled" and the old `isResumable` excludes filmed future nights).

Run: `cd mobile && node --import tsx --test lib/nightFlow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `mobile/lib/nightFlow.ts`** to the unified terminal and date-first helpers:

```ts
import { daysUntil, todayLocalISO } from "./date";
import type { Night } from "./nights";

// The night wizard's steps. "when" is the entry (date picker); "night" is the
// single terminal — one editable view for a night whatever its date or
// completeness (it replaced the old "recorded"/"scheduled" split).
export type Step = "when" | "who" | "pick" | "night";

// deriveInitialStep maps a resumed night to the step the wizard should open on.
// A film-set night, or a future picker-locked night (film optional), resumes on
// the unified Night terminal; a film-less tonight/past night resumes on "who"
// (the picker is re-derived on advancing; "pick" stays forward-only). `today` is
// injectable for deterministic tests (mirrors lib/date.ts).
export function deriveInitialStep(night: Night, today: string = todayLocalISO()): Step {
  if (night.movie !== null) return "night";
  if (night.pickerId !== null && daysUntil(night.scheduledFor, today) > 0) return "night";
  return "who";
}

// isResumable reports whether the group's latest night should be re-opened when
// the night wizard mounts. A future night is always resumable — a scheduled
// night stays editable even once a film is pre-picked. A tonight/past night is
// resumable only until a film attaches; once recorded it's done, so "Plan a
// night" starts fresh rather than re-opening a finished night. `today` is
// injectable for deterministic tests.
export function isResumable(night: Night, today: string = todayLocalISO()): boolean {
  if (daysUntil(night.scheduledFor, today) > 0) return true;
  return night.movie === null;
}
```

- [ ] **Step 4: Run the helper tests to confirm they PASS.**

Run: `cd mobile && node --import tsx --test lib/nightFlow.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `mobile/app/night/new.tsx`.** Make these edits:

(a) The night-steps import — replace `RecordedStep, ScheduledStep` with `NightView`:

```tsx
import { WhenStep, WhoStep, PickStep, NightView } from "../../components/night";
```

(b) `onAdvance` — always go to Pick. Replace:

```tsx
    if (recorded !== null) {
      setStep(daysUntil(recorded.scheduledFor, today) > 0 ? "scheduled" : "pick");
    }
  }, [night, order, runNightWrite, today]);
```

with:

```tsx
    if (recorded !== null) {
      setStep("pick");
    }
  }, [night, order, runNightWrite]);
```

(c) `onAttach` — land on the unified terminal. Replace `setStep("recorded");` with:

```tsx
        setStep("night");
```

(d) Add a skip handler. Right after the `onAttach` `useCallback` block, add:

```tsx
  // onSkipPick leaves the film unset and goes to the Night terminal — used for a
  // scheduled night where the film is chosen later (or on the night).
  const onSkipPick = useCallback(() => {
    setStep("night");
  }, []);
```

(e) Title + back logic. Replace:

```tsx
  const title = step === "pick" ? "The pick" : step === "recorded" ? "Tonight" : "New night";
```

with:

```tsx
  const title = step === "pick" ? "The pick" : step === "night" ? "Night" : "New night";
```

and replace:

```tsx
        back={step === "recorded" || step === "scheduled" ? undefined : back}
```

with:

```tsx
        back={step === "night" ? undefined : back}
```

(f) The render branches. Replace the two terminal branches:

```tsx
      ) : step === "scheduled" ? (
        <ScheduledStep night={night} members={members} onDone={() => router.back()} />
      ) : (
        <RecordedStep
          night={night}
          members={members}
          onDone={() => router.back()}
          onChangeMovie={() => setStep("pick")}
        />
      )}
```

with the single unified terminal:

```tsx
      ) : (
        <NightView
          night={night}
          members={members}
          today={today}
          onDone={() => router.back()}
          onPickFilm={() => setStep("pick")}
        />
      )}
```

(g) Pass `future` + `onSkip` to `PickStep`. In the `step === "pick"` branch, the `<PickStep ... />` currently lacks these — add them. Change the PickStep opening props to include:

```tsx
        <PickStep
          night={night}
          members={members}
          busy={busy}
          future={daysUntil(night.scheduledFor, today) > 0}
          changingPicker={changingPicker}
          setChangingPicker={setChangingPicker}
          movieQuery={movieQuery}
          setMovieQuery={setMovieQuery}
          results={results}
          searching={searching}
          searchError={searchError}
          onSearch={onSearch}
          onAttach={onAttach}
          onRecordPicker={onRecordPicker}
          onSkip={onSkipPick}
        />
```

- [ ] **Step 6: Make the Who footer uniform** in `mobile/components/night/WhoStep.tsx`. Replace:

```tsx
          title={
            picker
              ? `${future ? "Schedule" : "Next"} — ${firstNameOf(picker.name)} picks  →`
              : "Add who's here  →"
          }
```

with:

```tsx
          title={
            picker
              ? `Next — ${firstNameOf(picker.name)} picks  →`
              : "Add who's here  →"
          }
```

- [ ] **Step 7: Delete the old terminals and their exports.**

```bash
git rm mobile/components/night/ScheduledStep.tsx mobile/components/night/RecordedStep.tsx
```

Then in `mobile/components/night/index.ts`, remove these two lines:

```ts
export { RecordedStep } from "./RecordedStep";
export { ScheduledStep } from "./ScheduledStep";
```

- [ ] **Step 8: Run the full check.**

Run: `cd mobile && just check`
Expected: lint + typecheck + all tests pass. (If lint flags an unused `daysUntil`/`today` in `new.tsx`, confirm they are still used by the PickStep `future` prop and the `NightView` `today` prop — they are — and do not remove them.)

- [ ] **Step 9: Commit.**

```bash
git add mobile/lib/nightFlow.ts mobile/lib/nightFlow.test.ts "mobile/app/night/new.tsx" mobile/components/night/WhoStep.tsx mobile/components/night/index.ts
git commit -m "Wizard: Pick-always + unified NightView terminal; drop Scheduled/Recorded steps (#74)"
```

---

## Self-Review

**Spec coverage (Stage 1 section of `2026-06-22-unified-editable-night-design.md`):**
- Pick skippable + date-aware copy → Task 3. ✓
- `onAdvance` always Who→Pick; uniform Who footer → Task 5 (steps 5b, 6). ✓
- `onAttach` routes by date to the terminal → Task 5 (5c). ✓
- `NightView` replaces both terminals → Task 2 + Task 5 (5a, 5f, 7). ✓
- Date-first `deriveInitialStep` / `isResumable(night, today)` / `nextScheduledNight` → Task 5 (steps 1–4) + Task 1. ✓
- `UpNextCard` reflects a set film → Task 4. ✓
- Existing endpoints only; no backend → no backend task. ✓

**Placeholder scan:** none — every code step shows full content.

**Type consistency:** `Step` union (`"when"|"who"|"pick"|"night"`) defined in Task 5 step 3; consumed in `new.tsx` (5e, 5f) with the same literals. `NightView` props `{ night, members, today, onDone, onPickFilm }` defined in Task 2, matched in Task 5 (5f). `PickStep` new optional props `future?`/`onSkip?` defined in Task 3, passed in Task 5 (5g). `nextScheduledNight(nights, today?)` and `isResumable(night, today?)` signatures consistent across tasks. ✓
