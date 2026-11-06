import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ChevronRight, Settings } from "lucide-react-native";
import { useRouter } from "expo-router";

import {
  AppButton,
  Avatar,
  IconButton,
  MemberRow,
  PickerHero,
  SectionLabel,
  TabScrollView,
  TopBar,
  UpNextCard,
} from "../../components";
import { useGroup } from "../../components/GroupProvider";
import { useLoad } from "../../components/useLoad";
import { API_URL } from "../../apiUrl";
import { firstName } from "../../lib/avatar";
import { GROUP_ID } from "../../lib/api";
import { fetchTurn, pickerSummary, picksLabel, type TurnMember } from "../../lib/turn";
import { listNights, nightPicker, type Night } from "../../lib/nights";
import { alsoPlannedPicks, alsoPlannedWhen } from "../../lib/alsoPlanned";
import { todayLocalISO } from "../../lib/date";
import { tonightLineup } from "../../lib/tonight";
import {
  borderWidth,
  createThemedStyles,
  fontFamily,
  fontSize,
  lh,
  pressedOpacity,
  space,
  textPresets,
  useColors,
} from "../../theme";

// OnDeck lists who picks after the next picker (lib/tonight.ts) as flush
// rows with their pick counts.
function OnDeck({ label, members }: { label: string; members: TurnMember[] }) {
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <View>
        {members.map((m, i) => (
          <MemberRow
            key={m.id}
            name={m.name}
            right={picksLabel(m.servedCount)}
            divider={i < members.length - 1}
          />
        ))}
      </View>
    </>
  );
}

// AlsoPlanned lists the planned Nights after the UpNextCard, soonest first, as
// flush rows with hairlines between them: the picker's avatar, the date (and
// start time) over "Priya picks", and a chevron. A row opens its Night. No
// accent: the picker is only marked on the card above. Renders nothing when
// there are no other planned Nights.
function AlsoPlanned({ nights, onOpen }: { nights: Night[]; onOpen: (night: Night) => void }) {
  const colors = useColors();
  const styles = useStyles();
  if (nights.length === 0) {
    return null;
  }
  return (
    <>
      <SectionLabel marginTop={ALSO_PLANNED_GAP}>Also planned</SectionLabel>
      <View>
        {nights.map((n, i) => {
          const picker = nightPicker(n);
          const picks = alsoPlannedPicks(n);
          return (
            <Pressable
              key={n.id}
              onPress={() => onOpen(n)}
              accessibilityRole="button"
              accessibilityLabel={`${alsoPlannedWhen(n)}, ${picks}`}
              style={({ pressed }) => [
                styles.plannedRow,
                i < nights.length - 1 && styles.plannedDivider,
                pressed && styles.pressed,
              ]}
            >
              <Avatar name={picker.name} size={28} />
              <View style={styles.plannedText}>
                <Text style={styles.plannedWhen} numberOfLines={1}>
                  {alsoPlannedWhen(n)}
                </Text>
                <Text style={styles.plannedPicks} numberOfLines={1}>
                  {picks}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.text.tertiary} />
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

export default function TonightScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const { group } = useGroup();
  // Refetch the turn AND the planned nights on focus (useLoad's default): a
  // pick recorded, a roster change, or a night planned on another tab must show
  // up when the user returns — the tab screen stays mounted. `loading` gates
  // only the first load (all fetches together, so the card never flashes in
  // after the spotlight). A nights failure degrades to the spotlight — the turn
  // fetch owns the screen's error state. The group name is header chrome from
  // GroupProvider, which a rename in Settings updates.
  const {
    data: { order, nights },
    loading,
    error,
  } = useLoad(
    async (signal) => {
      const [order, nights] = await Promise.all([
        fetchTurn(API_URL, GROUP_ID, signal),
        listNights(API_URL, GROUP_ID, signal).catch(() => [] as Night[]),
      ]);
      return { order, nights };
    },
    { order: [] as TurnMember[], nights: [] as Night[] },
    "failed to load tonight",
  );

  const gear = (
    <IconButton
      icon={<Settings size={19} color={colors.text.secondary} strokeWidth={2} />}
      onPress={() => router.navigate("/settings")}
      accessibilityLabel="Settings"
      filled
    />
  );

  const lineup = tonightLineup(order, nights);
  const today = todayLocalISO();
  const openNight = (night: Night) => {
    router.navigate({ pathname: "/night/[id]", params: { id: night.id, from: "Tonight" } });
  };
  // The UpNextCard's actions, for the scheduled Night. "Choose the film" opens
  // the Night on its Pick step, whose back link returns to the Night view.
  const openPick = (night: Night) => {
    router.navigate({ pathname: "/night/[id]", params: { id: night.id, from: "Tonight", step: "pick" } });
  };
  const openWatched = (night: Night) => {
    router.navigate({ pathname: "/night/watched/[id]", params: { id: night.id, from: "Tonight" } });
  };
  const openEdit = (night: Night) => {
    router.navigate({ pathname: "/night/edit/[id]", params: { id: night.id, from: "Tonight" } });
  };

  return (
    <View style={styles.screen}>
      <TopBar kind="home" group={group?.name ?? ""} right={gear} />
      {loading ? (
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.text.secondary}
        />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load tonight: ${error}`}
        </Text>
      ) : lineup.kind === "empty" ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the rotation yet."}</Text>
        </View>
      ) : (
        <TabScrollView contentContainerStyle={styles.content}>
          {lineup.kind === "planned" ? (
            <>
              <UpNextCard
                night={lineup.night}
                today={today}
                onChooseFilm={() => openPick(lineup.night)}
                onWatched={() => openWatched(lineup.night)}
                onOpen={() => openNight(lineup.night)}
                onEdit={() => openEdit(lineup.night)}
              />
              <AlsoPlanned nights={lineup.alsoPlanned} onOpen={openNight} />
              {lineup.onDeck.length > 0 ? <OnDeck label="Then" members={lineup.onDeck} /> : null}
            </>
          ) : (
            <>
              <View style={styles.hero}>
                <PickerHero name={lineup.picker.name} meta="Next up · no night planned yet" />
                <Text style={styles.heroSummary}>{pickerSummary(lineup.picker)}</Text>
              </View>
              <View style={styles.actions}>
                <AppButton
                  title="Plan a night"
                  onPress={() => router.navigate("/night/new")}
                />
                <AppButton
                  title={`${firstName(lineup.picker.name)} can't make it`}
                  variant="ghost"
                  onPress={() => {}}
                />
              </View>
              {lineup.onDeck.length > 0 ? (
                <OnDeck label={`After ${firstName(lineup.picker.name)}`} members={lineup.onDeck} />
              ) : null}
              <View style={styles.linkRow}>
                <AppButton
                  title="See full rotation →"
                  variant="ghost"
                  size="sm"
                  strong
                  onPress={() => router.navigate("/rotation")}
                />
              </View>
            </>
          )}
        </TabScrollView>
      )}
    </View>
  );
}

// "Also planned" sits 28px under the UpNextCard (off the 4px-step scale's
// named stops, like Watched's later sections).
const ALSO_PLANNED_GAP = space[6] + space[1];

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  empty: { ...textPresets.body, color: colors.text.secondary, textAlign: "center" },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[4],
  },
  hero: { marginTop: space[6] },
  heroSummary: {
    ...textPresets.body,
    color: colors.text.secondary,
    marginTop: space[4],
    maxWidth: 290,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space[2],
    marginTop: space[6],
    marginBottom: space[3],
  },
  linkRow: { marginTop: space[2], alignItems: "flex-start" },
  plannedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  plannedDivider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  pressed: { opacity: pressedOpacity },
  // minWidth 0 lets a long line truncate instead of pushing the chevron out.
  plannedText: { flex: 1, minWidth: 0, gap: 2 },
  // No tabular figures: the date line is prose ("Sat 27 Jun · 8:00 PM").
  plannedWhen: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base),
    color: colors.text.primary,
  },
  plannedPicks: { ...textPresets.meta, color: colors.text.secondary },
}));
