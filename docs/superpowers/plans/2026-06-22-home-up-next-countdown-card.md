# Home "Up next" countdown card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tonight home lead with a scheduled-night countdown card when a night is on the calendar, falling back to the existing whose-turn spotlight when none is.

**Architecture:** A pure `nextScheduledNight` selector (soonest planned, movie-less, dated today-or-later) over the nights `listNights` already returns; a presentational `UpNextCard` component on the rationed-ember spotlight treatment; and home wiring that fetches nights alongside the turn and renders card-or-spotlight.

**Tech Stack:** Expo SDK 56 / React Native, TypeScript, `node:test` via `tsx` (table-driven, no mocks), `react-native-svg`, `lucide-react-native`.

**User decisions (already made):**
- Edit button is a UI-only no-op placeholder until #47 (matches the existing UI-only skip-turn button).
- `UpNextCard` is extracted to its own component file (not inlined like `SpotlightHero`).
- Start the night → `/night/new` (reuse the existing resume path).
- Recurrence/repeat row omitted (Phase 4, #48/#49 — no backing data).

---

### Task 1: `nextScheduledNight` selector

**Goal:** A pure selector that picks the soonest upcoming planned night (movie unattached, dated today-or-later), or null.

**Files:**
- Modify: `mobile/lib/nights.ts` (add import + selector at end of file)
- Test: `mobile/lib/nights.test.ts` (append cases)

**Acceptance Criteria:**
- [ ] Returns `null` for an empty list, only-past nights, or only movie-attached future nights.
- [ ] Returns the single upcoming planned night when there is one.
- [ ] Returns the soonest when several upcoming planned nights exist.
- [ ] Includes a night scheduled for today (`daysUntil === 0`).
- [ ] `today` is an injectable parameter (defaults to `todayLocalISO()`).

**Verify:** `cd mobile && node --import tsx --test lib/nights.test.ts` → all tests pass.

**Steps:**

- [ ] **Step 1: Write the failing tests** — append to `mobile/lib/nights.test.ts`:

```ts
import { nextScheduledNight, type Night } from "./nights";

const TODAY = "2026-06-22";
const aMovie = { tmdbId: 1, title: "Dune", releaseYear: 2021, posterUrl: "https://img/x.jpg" };

function night(id: string, scheduledFor: string, opts: Partial<Night> = {}): Night {
  return { id, scheduledFor, pickerId: "u1", movie: null, attendees: [], ...opts };
}

test("nextScheduledNight returns null for no nights", () => {
  assert.equal(nextScheduledNight([], TODAY), null);
});

test("nextScheduledNight ignores past nights", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-20")], TODAY), null);
});

test("nextScheduledNight ignores future nights with a movie attached", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-26", { movie: aMovie })], TODAY), null);
});

test("nextScheduledNight returns a single upcoming planned night", () => {
  assert.equal(nextScheduledNight([night("n1", "2026-06-26")], TODAY)?.id, "n1");
});

test("nextScheduledNight returns the soonest of several planned nights", () => {
  const n = nextScheduledNight(
    [night("far", "2026-07-10"), night("soon", "2026-06-26"), night("mid", "2026-06-30")],
    TODAY,
  );
  assert.equal(n?.id, "soon");
});

test("nextScheduledNight includes a night scheduled for today", () => {
  assert.equal(nextScheduledNight([night("n1", TODAY)], TODAY)?.id, "n1");
});

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

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && node --import tsx --test lib/nights.test.ts`
Expected: FAIL — `nextScheduledNight` is not exported (`SyntaxError`/`TypeError`).

- [ ] **Step 3: Write the selector** — in `mobile/lib/nights.ts`, add the import near the top (after the existing `import` lines):

```ts
import { daysUntil, todayLocalISO } from "./date";
```

Then append at the end of the file:

```ts
// nextScheduledNight is the home's named selector: the soonest upcoming planned
// night — movie still unattached, dated today or later — or null when none is
// scheduled. Fed by listNights (the backend returns every picker-set night), it
// drives the home's "Up next" countdown card; null falls back to the whose-turn
// spotlight. ISO YYYY-MM-DD strings compare chronologically as plain text, so
// the "soonest" pick needs no Date parsing (like history.ts). `today` is
// injectable for deterministic tests (mirrors lib/date.ts).
export function nextScheduledNight(
  nights: Night[],
  today: string = todayLocalISO(),
): Night | null {
  let soonest: Night | null = null;
  for (const n of nights) {
    if (n.movie !== null) continue;
    if (daysUntil(n.scheduledFor, today) < 0) continue;
    if (soonest === null || n.scheduledFor < soonest.scheduledFor) {
      soonest = n;
    }
  }
  return soonest;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && node --import tsx --test lib/nights.test.ts`
Expected: PASS — all `nextScheduledNight` cases plus the existing parse cases green.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/nights.ts mobile/lib/nights.test.ts
git commit -m "nextScheduledNight selector for the home countdown card (#46)"
```

---

### Task 2: `UpNextCard` component

**Goal:** A presentational countdown card for a scheduled night — ember spotlight treatment, countdown pill, serif date, picker row + coming avatars, Start/Edit actions.

**Files:**
- Create: `mobile/components/UpNextCard.tsx`
- Modify: `mobile/components/index.ts` (add the barrel export)

**Acceptance Criteria:**
- [ ] Renders the `✦ Next movie night` tag and a solid-ember countdown pill (Clock icon + uppercased `countdownLabel`).
- [ ] Renders the serif weekday+date via `formatWeekdayDate`.
- [ ] Renders the picker row (picker found via `attendees.find(a => a.id === pickerId)`) with up to 4 overlapping attendee avatars.
- [ ] Renders **Start the night** (primary) and **Edit** (secondary) calling `onStart` / `onEdit`.
- [ ] Uses only theme tokens — no hardcoded colors/spacing/radii/shadows.

**Verify:** `cd mobile && just typecheck && just lint` → both pass (no unit test — presentational RN component with no pure logic, per the repo convention that pure logic lives in `lib/`).

**Steps:**

- [ ] **Step 1: Create the component** — `mobile/components/UpNextCard.tsx`:

```tsx
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { Clock } from "lucide-react-native";

import { AppButton } from "./AppButton";
import { Avatar } from "./Avatar";
import { countdownLabel, formatWeekdayDate } from "../lib/date";
import type { Night } from "../lib/nights";
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
} from "../theme";

const MAX_AVATARS = 4; // overlapping "coming" faces shown on the picker row

// UpNextCard is the home's scheduled-night spotlight: when a night is on the
// calendar, the home leads with this countdown card instead of the whose-turn
// hero. It reuses the rationed-ember treatment (surface.dark + a bonfire wash +
// shadow.spotlight) — the scheduled night *is* "next up". Recurrence is deferred
// (#48/#49), so there is no repeat row yet; Edit is wired in #47.
export function UpNextCard({
  night,
  onStart,
  onEdit,
}: {
  night: Night;
  onStart: () => void;
  onEdit: () => void;
}) {
  const picker = night.attendees.find((a) => a.id === night.pickerId) ?? null;
  const coming = night.attendees.slice(0, MAX_AVATARS);
  return (
    <View style={styles.card}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="upNextWash" cx="50%" cy="0%" rx="80%" ry="55%">
            <Stop offset="0" stopColor={colors.accent.base} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors.accent.base} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#upNextWash)" />
      </Svg>

      <View style={styles.headerRow}>
        <Text style={styles.tag} allowFontScaling={false}>
          {"✦ Next movie night"}
        </Text>
        <View style={styles.pill}>
          <Clock size={12} color={colors.text.onAccent} strokeWidth={2.5} />
          <Text style={styles.pillText} allowFontScaling={false}>
            {countdownLabel(night.scheduledFor)}
          </Text>
        </View>
      </View>

      <Text style={styles.date} numberOfLines={1}>
        {formatWeekdayDate(night.scheduledFor)}
      </Text>

      {picker !== null ? (
        <View style={styles.pickerRow}>
          <Avatar name={picker.name} size={40} />
          <View style={styles.pickerText}>
            <Text style={styles.pickerName} numberOfLines={1}>
              {`${picker.name}'s pick`}
            </Text>
            <Text style={styles.pickerMeta} allowFontScaling={false}>
              {"Chooses the film that night"}
            </Text>
          </View>
          <View style={styles.avatars}>
            {coming.map((a, i) => (
              <View
                key={a.id}
                style={[styles.avatarChip, i > 0 && styles.avatarOverlap]}
              >
                <Avatar name={a.name} size={28} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.startWrap}>
          <AppButton title="Start the night" fullWidth onPress={onStart} />
        </View>
        <AppButton title="Edit" variant="secondary" onPress={onEdit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    paddingTop: space[5],
    paddingBottom: space[5],
    paddingHorizontal: space[5],
    backgroundColor: colors.surface.dark,
    overflow: "hidden",
    ...shadow.spotlight,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  tag: { ...textPresets.tag, color: colors.accent.strong, flexShrink: 1 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    backgroundColor: colors.accent.base,
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
  },
  pillText: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: trackPx(fontSize.caption, "caption"),
    color: colors.text.onAccent,
    textTransform: "uppercase",
  },
  date: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: trackPx(30, "display"),
    color: colors.text.primary,
    marginTop: space[4],
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    marginTop: space[4],
    paddingTop: space[4],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
  },
  pickerText: { flex: 1, minWidth: 0 },
  pickerName: { ...textPresets.rowName, color: colors.text.primary },
  pickerMeta: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    letterSpacing: trackPx(fontSize.caption, "caption"),
    color: colors.text.secondary,
    textTransform: "uppercase",
    marginTop: space[1],
  },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatarChip: {
    borderRadius: radius.full,
    borderWidth: borderWidth.regular,
    borderColor: colors.surface.dark,
  },
  avatarOverlap: { marginLeft: -space[3] },
  actions: { flexDirection: "row", gap: space[3], marginTop: space[5] },
  startWrap: { flex: 1 },
});
```

- [ ] **Step 2: Export from the barrel** — in `mobile/components/index.ts`, add after the `TabScrollView` export line:

```ts
export { UpNextCard } from "./UpNextCard";
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd mobile && just typecheck && just lint`
Expected: both pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/UpNextCard.tsx mobile/components/index.ts
git commit -m "UpNextCard — scheduled-night countdown card (#46)"
```

---

### Task 3: Wire the home to lead with the card

**Goal:** Fetch nights alongside the turn, derive `nextScheduledNight`, and render the `UpNextCard` (planned state) or the existing `SpotlightHero` (fallback).

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`

**Acceptance Criteria:**
- [ ] The home fetches `listNights` in the same focus-effect as the turn (via `Promise.all`), so `loading` gates both and the card never flashes in after the spotlight.
- [ ] A `listNights` failure degrades to the spotlight (it does not drive the screen's error state — the turn fetch still owns it).
- [ ] When `nextScheduledNight` returns a night, the home renders `UpNextCard` (and **Plan another night →** as the bottom link, with no skip-turn row).
- [ ] When it returns `null`, the home renders the unchanged `SpotlightHero` + skip-turn row + **See full rotation →**.
- [ ] `On deck` renders below in both states (when there is a picker order).

**Verify:** `cd mobile && just check` → lint + typecheck + tests all pass.

**Steps:**

- [ ] **Step 1: Import the new pieces** — in `mobile/app/(tabs)/index.tsx`, add `UpNextCard` to the components import and add the nights + date imports.

In the `from "../../components"` import block, add `UpNextCard`:

```tsx
import {
  AppButton,
  Avatar,
  IconButton,
  SectionLabel,
  TabScrollView,
  TopBar,
  UpNextCard,
} from "../../components";
```

Add these imports alongside the other `lib` imports:

```tsx
import { listNights, nextScheduledNight, type Night } from "../../lib/nights";
import { todayLocalISO } from "../../lib/date";
```

- [ ] **Step 2: Add nights state and fold the fetch into the turn effect**

Add a `nights` state declaration next to the existing `order` state (near line 112):

```tsx
const [nights, setNights] = useState<Night[]>([]);
```

Replace the turn focus-effect (the first `useFocusEffect`, currently fetching only the turn) with one that fetches both the turn and the nights together:

```tsx
  // Refetch the turn AND the planned nights on focus (not just mount): a pick
  // recorded, a roster change, or a night planned on another tab must show up
  // when the user returns — the tab screen stays mounted. `loading` gates only
  // the first load (both fetches together, so the card never flashes in after
  // the spotlight); later focuses refresh in the background. A nights failure
  // degrades to the spotlight — the turn fetch owns the screen's error state.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const [turn, planned] = await Promise.all([
            fetchTurn(API_URL, GROUP_ID, controller.signal),
            listNights(API_URL, GROUP_ID, controller.signal).catch(() => [] as Night[]),
          ]);
          setOrder(turn);
          setNights(planned);
          setError(null);
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
    }, []),
  );
```

- [ ] **Step 3: Derive the scheduled night**

After the existing `const picker = order[0] ?? null;` / `onDeck` / `firstName` derivations (near line 170), add:

```tsx
  const scheduled = nextScheduledNight(nights, todayLocalISO());
```

- [ ] **Step 4: Render card-or-spotlight**

In the loaded branch (the `<TabScrollView>` block, currently starting with `<SpotlightHero member={picker} />`), replace the hero + plan row + skip row with a conditional. Change this block:

```tsx
        <TabScrollView contentContainerStyle={styles.content}>
          <SpotlightHero member={picker} />
          <View style={styles.planRow}>
            <AppButton
              title="Plan a night  →"
              fullWidth
              onPress={() => router.navigate("/night/new")}
            />
          </View>
          <View style={styles.skipRow}>
            <AppButton
              title={`${firstName} can't make it — skip turn`}
              variant="ghost"
              onPress={() => {}}
            />
          </View>
          {onDeck.length > 0 ? <OnDeck members={onDeck} /> : null}
          <View style={styles.rotationRow}>
            <AppButton
              title="See full rotation  →"
              variant="ghost"
              onPress={() => router.navigate("/rotation")}
            />
          </View>
        </TabScrollView>
```

to:

```tsx
        <TabScrollView contentContainerStyle={styles.content}>
          {scheduled !== null ? (
            <>
              <UpNextCard
                night={scheduled}
                onStart={() => router.navigate("/night/new")}
                onEdit={() => {}}
              />
              {onDeck.length > 0 ? <OnDeck members={onDeck} /> : null}
              <View style={styles.rotationRow}>
                <AppButton
                  title="Plan another night  →"
                  variant="ghost"
                  onPress={() => router.navigate("/night/new")}
                />
              </View>
            </>
          ) : (
            <>
              <SpotlightHero member={picker} />
              <View style={styles.planRow}>
                <AppButton
                  title="Plan a night  →"
                  fullWidth
                  onPress={() => router.navigate("/night/new")}
                />
              </View>
              <View style={styles.skipRow}>
                <AppButton
                  title={`${firstName} can't make it — skip turn`}
                  variant="ghost"
                  onPress={() => {}}
                />
              </View>
              {onDeck.length > 0 ? <OnDeck members={onDeck} /> : null}
              <View style={styles.rotationRow}>
                <AppButton
                  title="See full rotation  →"
                  variant="ghost"
                  onPress={() => router.navigate("/rotation")}
                />
              </View>
            </>
          )}
        </TabScrollView>
```

Note: the `picker === null` empty-state branch above this stays unchanged. The
scheduled card needs a picker order only for `On deck`; when `order` is empty but
a night is somehow scheduled, the home already short-circuits to the
"No one's in the rotation yet" empty state (an edge that requires an empty
rotation with a planned night — not reachable through the normal flow).

- [ ] **Step 5: Run the full check**

Run: `cd mobile && just check`
Expected: lint + typecheck + tests all pass.

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(tabs)/index.tsx"
git commit -m "Home leads with the Up next countdown card when a night is scheduled (#46)"
```

---

## Self-Review

**Spec coverage:**
- `nextScheduledNight` selector (soonest, movie-null, ≥ today; injectable `today`; fed by `listNights`) → Task 1. ✓
- `UpNextCard` (ember spotlight, countdown pill, serif date, picker row + ≤4 avatars, Start/Edit, no repeat row) → Task 2. ✓
- Home wiring (Promise.all fetch, graceful nights degradation, card-or-spotlight, planned-state chrome, On deck in both) → Task 3. ✓
- Start → `/night/new`; Edit → no-op (#47) → Task 3 render. ✓
- Out of scope (Edit flow #47, recurrence #48/#49, by-id targeting) → not implemented. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows the full content. ✓

**Type consistency:** `nextScheduledNight(nights: Night[], today?: string): Night | null` defined in Task 1, consumed in Task 3 with `todayLocalISO()`. `UpNextCard` props `{ night, onStart, onEdit }` defined in Task 2, matched in Task 3. `Night` imported from `lib/nights` in all consumers. ✓
