# Night flow redesign (Who → Pick → Recorded) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `mobile/app/night.tsx` as a tonight-only three-step wizard — Who's here → The pick → Recorded — wired to the existing night/movie endpoints.

**Architecture:** One `app/night.tsx` route owns all data (`members`, `night`, `order`) and UI state (`step`, `busy`, search), rendering shared chrome (custom `TopBar`, local `Stepper`, bottom `WizardFooter`) plus three local step sub-components (`WhoStep`/`PickStep`/`RecordedStep`) — the same single-file-with-local-subcomponents pattern as `index.tsx`/`rotation.tsx`. The only extracted logic is the pure `deriveInitialStep` in `lib/nightFlow.ts` (unit-tested). No backend, endpoint, or shared-`components/` changes.

**Tech Stack:** Expo SDK 56 / React Native, expo-router, TypeScript; `node:test` + tsx for the one unit test. Spotlight theme tokens from `mobile/theme/`.

**User decisions (already made):**
- "Allow correcting" — auto-picker is spotlighted on Who's here; The pick offers a "Choose who picks" reveal to override (incl. guests).
- "Explicit start screen" — navigating to `/night` does NOT auto-create; show a "Start tonight's night" button when no night is open.
- Option A — keep the three step views local in one `app/night.tsx` (not extracted to `components/`).

---

## File structure

- `mobile/lib/nightFlow.ts` **(create)** — `type Step` + pure `deriveInitialStep(night)`.
- `mobile/lib/nightFlow.test.ts` **(create)** — table-driven test for `deriveInitialStep`.
- `mobile/app/night.tsx` **(rewrite)** — the wizard container + `Stepper` + `WizardFooter` + `WhoStep` + `PickStep` + `RecordedStep`, all local.
- `mobile/app/_layout.tsx` **(modify)** — flip the `night` Stack screen to `headerShown: false` (the wizard supplies its own `TopBar`).

All endpoints already exist in `lib/nights.ts` (`createNight`, `getCurrentNight`, `addAttendee`, `removeAttendee`, `getNightTurn`, `recordNightPick`, `attachMovie`) and `lib/movies.ts` (`searchMovies`). `getNightTurn` already returns **present active-core** members in turn order (backend passes attendees as the `present` set), so `order[0]` is the picker — no client-side intersection.

---

### Task 1: `deriveInitialStep` pure helper

**Goal:** A pure, unit-tested function mapping a resumed `Night` to the wizard step it should open on.

**Files:**
- Create: `mobile/lib/nightFlow.ts`
- Test: `mobile/lib/nightFlow.test.ts`

**Acceptance Criteria:**
- [ ] `deriveInitialStep` returns `"recorded"` when `movie !== null`, `"pick"` when `movie === null && pickerId !== null`, else `"who"`.
- [ ] `Step` type exported as `"who" | "pick" | "recorded"`.
- [ ] Table-driven test passes under `node:test`.

**Verify:** `cd mobile && node --import tsx --test lib/nightFlow.test.ts` → all tests pass.

**Steps:**

- [ ] **Step 1: Write the failing test** — create `mobile/lib/nightFlow.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveInitialStep, type Step } from "./nightFlow";
import type { Night } from "./nights";

// Minimal Night builder — only the fields deriveInitialStep reads matter.
function night(overrides: Partial<Night>): Night {
  return {
    id: "n1",
    scheduledFor: "2026-06-17",
    pickerId: null,
    movie: null,
    attendees: [],
    ...overrides,
  };
}

const MOVIE = { tmdbId: 1, title: "Past Lives", releaseYear: 2023, posterUrl: null };

test("deriveInitialStep maps a resumed night to its wizard step", () => {
  const cases: { name: string; input: Night; want: Step }[] = [
    { name: "fresh night → who", input: night({}), want: "who" },
    { name: "picker recorded, no movie → pick", input: night({ pickerId: "m1" }), want: "pick" },
    { name: "movie attached → recorded", input: night({ pickerId: "m1", movie: MOVIE }), want: "recorded" },
    { name: "movie attached without picker (defensive) → recorded", input: night({ movie: MOVIE }), want: "recorded" },
  ];
  for (const c of cases) {
    assert.equal(deriveInitialStep(c.input), c.want, c.name);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && node --import tsx --test lib/nightFlow.test.ts`
Expected: FAIL — cannot resolve `./nightFlow` / `deriveInitialStep is not a function`.

- [ ] **Step 3: Write minimal implementation** — create `mobile/lib/nightFlow.ts`:

```ts
import type { Night } from "./nights";

// The night wizard's three steps, tonight-only. The prototype's "When" step is
// Phase 3 (scheduling) and is intentionally absent here.
export type Step = "who" | "pick" | "recorded";

// deriveInitialStep maps a resumed night to the step the wizard should open on,
// so leaving and returning lands in the right place: an attached movie means the
// night is recorded; a recorded picker with no movie yet means we're mid-pick;
// otherwise the night is fresh and we start at attendance.
export function deriveInitialStep(night: Night): Step {
  if (night.movie !== null) return "recorded";
  if (night.pickerId !== null) return "pick";
  return "who";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && node --import tsx --test lib/nightFlow.test.ts`
Expected: PASS (1 test, 0 failures).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/nightFlow.ts mobile/lib/nightFlow.test.ts
git commit -m "feat(mobile): deriveInitialStep — resume the night wizard at the right step"
```

---

### Task 2: Wizard container + Who's here step + layout flip

**Goal:** Rewrite `app/night.tsx` as the wizard: data load + resume, explicit-start screen, the `Stepper`/`WizardFooter` chrome, and a complete **Who's here** step; flip the `night` route to its own header. The pick/recorded branches render a temporary placeholder, filled in Tasks 3–4.

**Files:**
- Rewrite: `mobile/app/night.tsx`
- Modify: `mobile/app/_layout.tsx:38`

**Acceptance Criteria:**
- [ ] `/night` with no open night shows a "Start tonight's night" button; tapping it creates tonight's night and lands on Who's here.
- [ ] On resume, an open night loads its turn order and opens on `deriveInitialStep(night)`.
- [ ] Who's here lists the full roster as attendance toggles (present bright, absent dimmed) wired to `addAttendee`/`removeAttendee`; the next-up present core member (`order[0]`) gets the spotlight + `GETS THE PICK`.
- [ ] The footer CTA "Next — {firstName} picks →" is disabled until a present core picker exists; pressing it records the pick (`recordNightPick(order[0].id)`) and advances to the pick step.
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → lint + typecheck + tests pass. Then `just start`, open the seeded "Friday Film Club": Start → toggle attendance and watch `GETS THE PICK` move to the next-up present member → Next advances (and the placeholder shows).

**Steps:**

- [ ] **Step 1: Flip the `night` route header** in `mobile/app/_layout.tsx` (line 38):

Replace:
```tsx
        <Stack.Screen name="night" options={{ title: "Tonight" }} />
```
with:
```tsx
        {/* Custom TopBar (kind="title") supplies its own header + back link. */}
        <Stack.Screen name="night" options={{ headerShown: false }} />
```

- [ ] **Step 2: Rewrite `mobile/app/night.tsx`** with the full container, chrome, `WhoStep`, and placeholder branches:

```tsx
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import { AppButton, Avatar, Badge, SectionLabel, TopBar } from "../components";
import { GROUP_ID, resolveApiBaseUrl } from "../lib/api";
import { formatShortDate, todayLocalISO } from "../lib/date";
import { errorMessage } from "../lib/errors";
import { fetchMembers, type Member } from "../lib/members";
import {
  addAttendee,
  attachMovie,
  createNight,
  getCurrentNight,
  getNightTurn,
  recordNightPick,
  removeAttendee,
  type Night,
} from "../lib/nights";
import { searchMovies, type Movie } from "../lib/movies";
import { type TurnMember } from "../lib/turn";
import { deriveInitialStep, type Step } from "../lib/nightFlow";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  shadow,
  space,
  textPresets,
} from "../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const STEP_LABELS = ["Here", "Pick", "Done"] as const;
const STEP_INDEX: Record<Step, number> = { who: 0, pick: 1, recorded: 2 };

function firstNameOf(name: string): string {
  return name.split(" ")[0];
}

// Stepper is the wizard's three-dot progress rail (Here · Pick · Done). Dots
// before the current step show a check; the current dot is ember; the rest are
// muted. Tonight-only — "When" is prepended in Phase 3.
function Stepper({ current }: { current: number }) {
  return (
    <View style={styles.stepper}>
      {STEP_LABELS.map((label, i) => {
        const on = i === current;
        const done = i < current;
        return (
          <Fragment key={label}>
            {i > 0 ? (
              <View style={[styles.stepBar, done && styles.stepBarDone]} />
            ) : null}
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, (on || done) && styles.stepDotActive]}>
                <Text
                  style={[styles.stepDotText, (on || done) && styles.stepDotTextActive]}
                  allowFontScaling={false}
                >
                  {done ? "✓" : String(i + 1)}
                </Text>
              </View>
              <Text
                style={[styles.stepLabel, on && styles.stepLabelActive]}
                allowFontScaling={false}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

// WizardFooter pins a step's action(s) to the bottom, clearing the safe-area
// inset, with a hairline top edge over the page.
function WizardFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
      {children}
    </View>
  );
}

// WhoStep — attendance toggles for the full roster. The next-up present core
// member (order[0]) is spotlighted as the picker; the footer records the pick
// and advances.
function WhoStep({
  night,
  members,
  order,
  attendeeIds,
  busy,
  onToggle,
  onNext,
}: {
  night: Night;
  members: Member[];
  order: TurnMember[];
  attendeeIds: Set<string>;
  busy: string | null;
  onToggle: (m: Member) => void;
  onNext: () => void;
}) {
  const picker = order[0] ?? null;
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stepper current={0} />
        <Text style={styles.heading}>{`Night of ${formatShortDate(night.scheduledFor)}`}</Text>
        <Text style={styles.hint}>
          {"Tap who made it. Tonight's pick goes to whoever's next up and here."}
        </Text>

        <SectionLabel>{"Who's here?"}</SectionLabel>
        {members.map((m) => {
          const here = attendeeIds.has(m.id);
          const isPicker = picker?.id === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => onToggle(m)}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.attendRow,
                isPicker ? styles.pickerRow : styles.attendDivider,
                !here && styles.dimmed,
                pressed && styles.rowPressed,
              ]}
            >
              <Avatar name={m.name} size={40} glow={isPicker} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                </Text>
                {isPicker ? <Text style={styles.getsPick}>GETS THE PICK</Text> : null}
              </View>
              {busy === m.id ? (
                <Text style={styles.tag}>…</Text>
              ) : here ? (
                <Badge label="✓ In" tone="solid" uppercase={false} />
              ) : (
                <Text style={styles.outTag}>OUT</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <WizardFooter>
        <AppButton
          title={picker ? `Next — ${firstNameOf(picker.name)} picks  →` : "Add who's here  →"}
          fullWidth
          disabled={busy !== null || picker === null}
          onPress={onNext}
        />
      </WizardFooter>
    </View>
  );
}

export default function NightScreen() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [night, setNight] = useState<Night | null>(null);
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The member id with an action in flight, "create" while creating, or "movie"
  // while attaching.
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("who");

  // Resume the group's open night (if any) and land on the right step. The
  // backend enforces at most one open night per group, so resume is unambiguous.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [roster, current] = await Promise.all([
          fetchMembers(API_URL, GROUP_ID, controller.signal),
          getCurrentNight(API_URL, GROUP_ID, controller.signal),
        ]);
        setMembers(roster);
        if (current !== null) {
          setNight(current);
          setStep(deriveInitialStep(current));
          setOrder(await getNightTurn(API_URL, GROUP_ID, current.id, controller.signal));
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load tonight"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const attendeeIds = useMemo(
    () => new Set((night?.attendees ?? []).map((a) => a.id)),
    [night],
  );

  const refreshOrder = useCallback(async (nightId: string) => {
    setOrder(await getNightTurn(API_URL, GROUP_ID, nightId));
  }, []);

  // runNightWrite is the shared envelope for write actions: guard against a
  // concurrent action, mark busyKey in flight, run the write, adopt the returned
  // night, then refresh the pick order — reporting a refresh failure on its own
  // so a successful write is never shown as failed. Returns the updated night,
  // or null on failure, so callers can advance the step only on success.
  const runNightWrite = useCallback(
    async (
      busyKey: string,
      write: () => Promise<Night>,
      fallback: string,
      clearOrder = false,
    ): Promise<Night | null> => {
      if (busy !== null) {
        return null;
      }
      setBusy(busyKey);
      setActionError(null);
      try {
        const updated = await write();
        setNight(updated);
        if (clearOrder) {
          setOrder([]);
        }
        try {
          await refreshOrder(updated.id);
        } catch (e) {
          setActionError(errorMessage(e, "failed to load pick order"));
        }
        return updated;
      } catch (e) {
        setActionError(errorMessage(e, fallback));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [busy, refreshOrder],
  );

  const onCreate = useCallback(async () => {
    const created = await runNightWrite(
      "create",
      () => createNight(API_URL, GROUP_ID, todayLocalISO()),
      "failed to create night",
      true,
    );
    if (created !== null) {
      setStep("who");
    }
  }, [runNightWrite]);

  const onToggle = useCallback(
    (member: Member) => {
      if (night === null) {
        return;
      }
      return runNightWrite(
        member.id,
        () =>
          attendeeIds.has(member.id)
            ? removeAttendee(API_URL, GROUP_ID, night.id, member.id)
            : addAttendee(API_URL, GROUP_ID, night.id, member.id),
        "failed to update attendance",
      );
    },
    [night, attendeeIds, runNightWrite],
  );

  // onAdvanceToPick records the auto-picker (the next-up present core member)
  // then moves to the pick step. Recording is what credits the turn, so it must
  // happen — a movie alone does not advance fairness standings.
  const onAdvanceToPick = useCallback(async () => {
    const top = order[0] ?? null;
    if (night === null || top === null) {
      return;
    }
    const recorded = await runNightWrite(
      top.id,
      () => recordNightPick(API_URL, GROUP_ID, night.id, top.id),
      "failed to record pick",
    );
    if (recorded !== null) {
      setStep("pick");
    }
  }, [night, order, runNightWrite]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      </View>
    );
  }
  if (error !== null) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.center, styles.error]}>{`Couldn't load tonight: ${error}`}</Text>
      </View>
    );
  }

  const back =
    step === "pick"
      ? { label: "Here", onPress: () => setStep("who") }
      : { label: "Cancel", onPress: () => router.back() };
  const title = step === "pick" ? "The pick" : step === "recorded" ? "Tonight" : "New night";

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title={title}
        back={step === "recorded" ? undefined : back}
      />
      {actionError !== null ? (
        <Text style={[styles.banner, styles.error]}>{actionError}</Text>
      ) : null}

      {night === null ? (
        <View style={styles.start}>
          <Text style={styles.hint}>{"Start tonight's night to record who's here."}</Text>
          <AppButton
            title="Start tonight's night"
            onPress={onCreate}
            disabled={busy !== null}
          />
        </View>
      ) : step === "who" ? (
        <WhoStep
          night={night}
          members={members}
          order={order}
          attendeeIds={attendeeIds}
          busy={busy}
          onToggle={onToggle}
          onNext={onAdvanceToPick}
        />
      ) : (
        // Placeholder for the pick/recorded steps — replaced in Tasks 3–4.
        <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content}>
            <Stepper current={STEP_INDEX[step]} />
            <Text style={styles.hint}>{"This step lands in a following task."}</Text>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  flex: { flex: 1 },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[6],
  },
  start: { marginTop: space[8], gap: space[3], alignItems: "center", paddingHorizontal: space[5] },
  hint: { ...textPresets.meta, color: colors.text.secondary },
  heading: {
    ...textPresets.screenTitle,
    color: colors.text.primary,
    marginTop: space[4],
  },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
    backgroundColor: colors.surface.page,
    gap: space[2],
  },
  // Stepper
  stepper: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[2] },
  stepItem: { flexDirection: "row", alignItems: "center", gap: space[1] },
  stepBar: { flex: 1, height: 1, backgroundColor: colors.border.hairline },
  stepBarDone: { backgroundColor: colors.accent.base },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.subtle,
  },
  stepDotActive: { backgroundColor: colors.accent.base },
  stepDotText: { fontFamily: fontFamily.monoBold, fontSize: 10, color: colors.text.tertiary },
  stepDotTextActive: { color: colors.text.onAccent },
  stepLabel: { ...textPresets.tag, color: colors.text.tertiary },
  stepLabelActive: { color: colors.accent.strong },
  // Attendance rows
  attendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[2],
  },
  attendDivider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  // The picker spotlight IS "whose turn" — the rationed ember.
  pickerRow: {
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  dimmed: { opacity: 0.5 },
  rowPressed: { opacity: 0.72 },
  rowText: { flex: 1 },
  name: { ...textPresets.rowName, color: colors.text.primary },
  getsPick: { ...textPresets.tag, color: colors.accent.strong, marginTop: space[1] },
  outTag: { ...textPresets.tag, color: colors.text.tertiary },
  tag: { ...textPresets.tag, color: colors.text.secondary },
});
```

- [ ] **Step 3: Verify** — `cd mobile && just check` → passes. Then `just start` and walk Who's here per the Verify line above.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/night.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): night wizard shell + Who's here step (#35)"
```

---

### Task 3: The pick step (search + picker correction)

**Goal:** Replace the placeholder branch with `PickStep`: the picker spotlight card, a "Choose who picks" correction reveal over present attendees, and film search whose result selection attaches the movie and advances to Recorded.

**Files:**
- Modify: `mobile/app/night.tsx`

**Acceptance Criteria:**
- [ ] The pick step shows the recorded picker (resolved from `night.pickerId`) in an ember spotlight card.
- [ ] "Not {firstName}? Choose who picks" reveals the present attendees (incl. guests); tapping one calls `recordNightPick` and collapses the list.
- [ ] The search field calls `searchMovies`; results show poster thumb + title + year; tapping a result calls `attachMovie` and advances to Recorded.
- [ ] Search errors render inline; all controls disable while `busy`.
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → passes. Then `just start`: from Who's here advance to The pick → correct the picker to another present member and back → search a film, select it → advances to the (placeholder) recorded step.

**Steps:**

- [ ] **Step 1: Add the `Input` and `Poster` imports.** In `mobile/app/night.tsx`, change the components import line:

From:
```tsx
import { AppButton, Avatar, Badge, SectionLabel, TopBar } from "../components";
```
to:
```tsx
import { AppButton, Avatar, Badge, Input, Poster, SectionLabel, TopBar } from "../components";
```

- [ ] **Step 2: Add the `PickStep` component** immediately above `export default function NightScreen()`:

```tsx
// PickStep — the picker spotlight (with a correction reveal over present
// attendees), then film search. Selecting a result attaches the movie and
// advances; selection is the action, so this step has no footer CTA.
function PickStep({
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
  night: Night;
  members: Member[];
  busy: string | null;
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
}) {
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stepper current={1} />

        <View style={styles.pickerCard}>
          <Avatar name={pickerName} size={44} glow />
          <View style={styles.rowText}>
            <Text style={styles.pickingTag}>{"✦ Picking tonight"}</Text>
            <Text style={styles.pickerName} numberOfLines={1}>
              {pickerName}
            </Text>
          </View>
        </View>

        <View style={styles.changeRow}>
          <AppButton
            title={
              changingPicker
                ? "Keep this picker"
                : `Not ${firstNameOf(pickerName)}? Choose who picks`
            }
            variant="ghost"
            onPress={() => setChangingPicker(!changingPicker)}
            disabled={busy !== null}
          />
        </View>
        {changingPicker
          ? night.attendees.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => onRecordPicker(a.id)}
                disabled={busy !== null}
                style={({ pressed }) => [styles.chooseRow, pressed && styles.rowPressed]}
              >
                <Avatar name={a.name} size={32} />
                <Text style={[styles.name, styles.rowText]} numberOfLines={1}>
                  {a.name}
                </Text>
                {busy === a.id ? (
                  <Text style={styles.tag}>…</Text>
                ) : night.pickerId === a.id ? (
                  <Badge label="Picking" />
                ) : null}
              </Pressable>
            ))
          : null}

        <SectionLabel>{"Find a film"}</SectionLabel>
        <Input
          value={movieQuery}
          onChangeText={setMovieQuery}
          placeholder="Search a film title…"
          onSubmitEditing={onSearch}
          addonLabel="Search"
          onAddonPress={onSearch}
        />
        {searchError !== null ? (
          <Text style={[styles.hint, styles.error]}>{searchError}</Text>
        ) : null}
        {searching ? (
          <ActivityIndicator style={styles.searchSpinner} color={colors.accent.base} />
        ) : null}

        {results.map((mv) => (
          <Pressable
            key={mv.tmdbId}
            onPress={() => onAttach(mv.tmdbId)}
            disabled={busy !== null}
            style={({ pressed }) => [styles.resultRow, pressed && styles.rowPressed]}
          >
            <Poster uri={mv.posterUrl} title={mv.title} w={42} h={63} />
            <View style={styles.rowText}>
              <Text style={styles.resultTitle} numberOfLines={2}>
                {mv.title}
              </Text>
              {mv.releaseYear !== null ? (
                <Text style={styles.resultYear}>{mv.releaseYear}</Text>
              ) : null}
            </View>
            {busy === "movie" ? <Text style={styles.tag}>…</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 3: Add the pick-step state** inside `NightScreen`, right after `const [step, setStep] = useState<Step>("who");`:

```tsx
  const [movieQuery, setMovieQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [changingPicker, setChangingPicker] = useState(false);
```

- [ ] **Step 4: Add the pick-step handlers** inside `NightScreen`, after `onAdvanceToPick`:

```tsx
  // onRecordPicker corrects the night's picker to another present attendee.
  const onRecordPicker = useCallback(
    async (memberId: string) => {
      if (night === null) {
        return;
      }
      const recorded = await runNightWrite(
        memberId,
        () => recordNightPick(API_URL, GROUP_ID, night.id, memberId),
        "failed to record pick",
      );
      if (recorded !== null) {
        setChangingPicker(false);
      }
    },
    [night, runNightWrite],
  );

  const onSearch = useCallback(async () => {
    const q = movieQuery.trim();
    if (q === "") {
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchMovies(API_URL, q));
    } catch (e) {
      setSearchError(errorMessage(e, "search failed"));
    } finally {
      setSearching(false);
    }
  }, [movieQuery]);

  // onAttach sets (or changes) the movie, then advances to Recorded. Bypasses
  // runNightWrite because it advances the step and clears search state on success.
  const onAttach = useCallback(
    async (tmdbId: number) => {
      if (night === null || busy !== null) {
        return;
      }
      setBusy("movie");
      setActionError(null);
      try {
        const updated = await attachMovie(API_URL, GROUP_ID, night.id, tmdbId);
        setNight(updated);
        setResults([]);
        setSearchError(null);
        setMovieQuery("");
        setStep("recorded");
      } catch (e) {
        setActionError(errorMessage(e, "failed to attach movie"));
      } finally {
        setBusy(null);
      }
    },
    [night, busy],
  );
```

- [ ] **Step 5: Wire the pick branch.** In the render, replace the placeholder branch (the comment + `View` after `) : (`) with a `step === "pick"` arm and a smaller placeholder for recorded:

From:
```tsx
      ) : (
        // Placeholder for the pick/recorded steps — replaced in Tasks 3–4.
        <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content}>
            <Stepper current={STEP_INDEX[step]} />
            <Text style={styles.hint}>{"This step lands in a following task."}</Text>
          </ScrollView>
        </View>
      )}
```
to:
```tsx
      ) : step === "pick" ? (
        <PickStep
          night={night}
          members={members}
          busy={busy}
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
        />
      ) : (
        // Placeholder for the recorded step — replaced in Task 4.
        <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content}>
            <Stepper current={2} />
            <Text style={styles.hint}>{"Recorded step lands in the next task."}</Text>
          </ScrollView>
        </View>
      )}
```

- [ ] **Step 6: Add the pick-step styles** to the `styles` StyleSheet (append these keys before the closing `});`):

```tsx
  pickerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    marginTop: space[4],
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pickingTag: { ...textPresets.tag, color: colors.accent.strong },
  pickerName: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[1] },
  changeRow: { marginTop: space[2], alignItems: "flex-start" },
  chooseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
  },
  searchSpinner: { marginTop: space[3] },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  resultTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 22,
    color: colors.text.primary,
  },
  resultYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    marginTop: space[1],
  },
```

- [ ] **Step 7: Verify** — `cd mobile && just check` → passes; then `just start` and walk the Verify line.

- [ ] **Step 8: Commit**

```bash
git add mobile/app/night.tsx
git commit -m "feat(mobile): night wizard — The pick step (search + picker correction) (#35)"
```

---

### Task 4: The Recorded step

**Goal:** Replace the recorded placeholder with `RecordedStep`: poster hero, RECORDED ✓ badge, title/year, picked-by line, who-watched avatar cluster, and Done / Change movie footer actions.

**Files:**
- Modify: `mobile/app/night.tsx`

**Acceptance Criteria:**
- [ ] Recorded shows the attached movie's poster (150×222), a solid `RECORDED ✓` badge, serif title, mono year (omitted when null), and "Picked by {name} · {date}".
- [ ] A "Who watched" overlapping avatar cluster lists all `night.attendees`.
- [ ] "Done — back to rotation" calls `router.back()`; "Change movie" returns to the pick step.
- [ ] `just check` passes.

**Verify:** `cd mobile && just check` → passes. Then `just start`: complete a night (Who → Pick → select a film) and confirm the recorded hero, picked-by, and who-watched cluster render; "Change movie" returns to search; "Done" returns to Tonight. Relaunch the app mid-flow and confirm it resumes on the right step (`deriveInitialStep`).

**Steps:**

- [ ] **Step 1: Add the `RecordedStep` component** above `export default function NightScreen()` (below `PickStep`):

```tsx
// RecordedStep — the finished-night hero: poster, RECORDED badge, title/year,
// who picked, and the who-watched cluster. Renders nothing if the movie is
// somehow absent (the container only mounts it when night.movie is set).
function RecordedStep({
  night,
  members,
  onDone,
  onChangeMovie,
}: {
  night: Night;
  members: Member[];
  onDone: () => void;
  onChangeMovie: () => void;
}) {
  if (night.movie === null) {
    return null;
  }
  const movie = night.movie;
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.recordedContent}>
        <Poster uri={movie.posterUrl} title={movie.title} w={150} h={222} />
        <View style={styles.recordedBadge}>
          <Badge label="Recorded ✓" tone="solid" />
        </View>
        <Text style={styles.recordedTitle} numberOfLines={3}>
          {movie.title}
        </Text>
        {movie.releaseYear !== null ? (
          <Text style={styles.recordedYear}>{movie.releaseYear}</Text>
        ) : null}

        <View style={styles.pickedBy}>
          <Avatar name={pickerName} size={28} />
          <Text style={styles.pickedByText}>
            {"Picked by "}
            <Text style={styles.pickedByName}>{pickerName}</Text>
            {` · ${formatShortDate(night.scheduledFor)}`}
          </Text>
        </View>

        <SectionLabel>{"Who watched"}</SectionLabel>
        <View style={styles.watchedCluster}>
          {night.attendees.map((a, i) => (
            <View key={a.id} style={[styles.watchedAvatar, i > 0 && styles.watchedOverlap]}>
              <Avatar name={a.name} size={40} />
            </View>
          ))}
        </View>
      </ScrollView>
      <WizardFooter>
        <AppButton title="Done — back to rotation" fullWidth onPress={onDone} />
        <View style={styles.changeMovieRow}>
          <AppButton title="Change movie" variant="ghost" onPress={onChangeMovie} />
        </View>
      </WizardFooter>
    </View>
  );
}
```

- [ ] **Step 2: Wire the recorded branch.** In the render, replace the recorded placeholder (the comment + `View` after the final `) : (`) with:

From:
```tsx
      ) : (
        // Placeholder for the recorded step — replaced in Task 4.
        <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content}>
            <Stepper current={2} />
            <Text style={styles.hint}>{"Recorded step lands in the next task."}</Text>
          </ScrollView>
        </View>
      )}
```
to:
```tsx
      ) : (
        <RecordedStep
          night={night}
          members={members}
          onDone={() => router.back()}
          onChangeMovie={() => setStep("pick")}
        />
      )}
```

- [ ] **Step 3: Add the recorded-step styles** to the `styles` StyleSheet (append before the closing `});`):

```tsx
  recordedContent: {
    paddingHorizontal: space[5],
    paddingTop: space[5],
    paddingBottom: space[6],
    alignItems: "center",
  },
  recordedBadge: { marginTop: space[5] },
  recordedTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  recordedYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  pickedBy: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[5] },
  pickedByText: { ...textPresets.meta, color: colors.text.secondary },
  pickedByName: { color: colors.text.primary, fontFamily: fontFamily.sansSemibold },
  watchedCluster: { flexDirection: "row", justifyContent: "center", paddingTop: space[2] },
  // 3px page-colored ring so overlapping avatars read as separate.
  watchedAvatar: {
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.surface.page,
  },
  watchedOverlap: { marginLeft: -space[2] },
  changeMovieRow: { alignItems: "center" },
```

- [ ] **Step 4: Verify** — `cd mobile && just check` → passes; then `just start` and walk the full Verify line (including resume).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/night.tsx
git commit -m "feat(mobile): night wizard — Recorded step + who-watched cluster (#35)"
```

---

## Self-Review

**Spec coverage:**
- Wizard + stepper, tonight-only (Here·Pick·Done) → Task 2 `Stepper`. ✓
- Who's here: attendance toggles, present dims off, picker spotlight + GETS THE PICK → Task 2 `WhoStep`. ✓
- The pick: picker spotlight, correction reveal (decision), search + results → Task 3 `PickStep`. ✓
- Recorded: poster 150×222, RECORDED ✓, title, picked-by, who-watched cluster → Task 4 `RecordedStep`. ✓
- Explicit-start (decision) → Task 2 start view. ✓
- Resume via `deriveInitialStep` → Task 1 + Task 2 mount effect. ✓
- Wire to existing endpoints, no backend change → all tasks use `lib/nights.ts`/`lib/movies.ts`. ✓
- `just check` passes → every UI task's Verify. ✓
- Out of scope (When/Scheduled, skip-turn, reactions, history) → not implemented. ✓

**Placeholder scan:** The "placeholder" branches in Tasks 2–3 are intentional intermediate runnable states, each explicitly replaced in the next task — not unfinished plan content. No TBD/TODO left in the final code.

**Type consistency:** `Step` (`who`/`pick`/`recorded`) consistent across `lib/nightFlow.ts`, `STEP_INDEX`, and all `setStep` calls. `runNightWrite` returns `Promise<Night | null>`; callers check `!== null` before advancing. `Member`/`Night`/`Movie`/`TurnMember` types used match their `lib/` definitions. Component prop names match call sites (verified Task 3 `PickStep` props ↔ render call; Task 4 `RecordedStep` props ↔ render call).

## Notes / minor deviations
- The recorded poster uses `Poster`'s built-in `radius.sm` corners (the shared component takes no radius prop); a 6px radius on a 150px poster is faithful enough and avoids touching a shared primitive.
- Movie runtime ("1h 46m" in the prototype) is not in the `Movie` model — year only; no fabricated runtime.
