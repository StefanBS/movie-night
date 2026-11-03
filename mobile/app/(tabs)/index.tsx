import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Settings } from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";

import {
  AppButton,
  IconButton,
  MemberRow,
  PickerHero,
  SectionLabel,
  TabScrollView,
  TopBar,
  UpNextCard,
} from "../../components";
import { API_URL } from "../../apiUrl";
import { firstName } from "../../lib/avatar";
import { GROUP_ID } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { fetchGroup } from "../../lib/group";
import { fetchTurn, pickerSummary, picksLabel, type TurnMember } from "../../lib/turn";
import { listNights, type Night } from "../../lib/nights";
import { upNext } from "../../lib/nightLifecycle";
import { todayLocalISO } from "../../lib/date";
import { createThemedStyles, space, textPresets, useColors } from "../../theme";

// OnDeck lists the next members after the picker (turn elements 1–3) as flush
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

export default function TonightScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // The group name is secondary header chrome, fetched independently of the
  // turn. Refetch on focus (not just mount) so a rename in Settings
  // shows here when the user returns — tab screens stay mounted. A failure just
  // leaves the header line blank rather than driving the screen's error state.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const g = await fetchGroup(API_URL, GROUP_ID, controller.signal);
          setGroupName(g.name);
        } catch {
          // Ignored — the turn fetch owns the screen's error state.
        }
      })();
      return () => controller.abort();
    }, []),
  );

  const gear = (
    <IconButton
      icon={<Settings size={19} color={colors.text.secondary} strokeWidth={2} />}
      onPress={() => router.navigate("/settings")}
      accessibilityLabel="Settings"
      filled
    />
  );

  const picker = order[0] ?? null;
  const onDeck = order.slice(1, 4);
  const pickerFirstName = picker ? firstName(picker.name) : "";
  const today = todayLocalISO();
  const scheduled = upNext(nights, today);
  const openScheduled = () => {
    if (scheduled === null) {
      return;
    }
    router.navigate({ pathname: "/night/[id]", params: { id: scheduled.id } });
  };
  const openEdit = () => {
    if (scheduled === null) {
      return;
    }
    router.navigate({ pathname: "/night/edit/[id]", params: { id: scheduled.id } });
  };

  return (
    <View style={styles.screen}>
      <TopBar kind="home" group={groupName ?? ""} right={gear} />
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
      ) : picker === null ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the rotation yet."}</Text>
        </View>
      ) : (
        <TabScrollView contentContainerStyle={styles.content}>
          {scheduled !== null ? (
            <>
              <UpNextCard
                night={scheduled}
                today={today}
                onStart={openScheduled}
                onEdit={openEdit}
              />
              {onDeck.length > 0 ? <OnDeck label="Then" members={onDeck} /> : null}
            </>
          ) : (
            <>
              <View style={styles.hero}>
                <PickerHero name={picker.name} meta="Next up · no night planned yet" />
                <Text style={styles.heroSummary}>{pickerSummary(picker)}</Text>
              </View>
              <View style={styles.actions}>
                <AppButton
                  title="Plan a night"
                  onPress={() => router.navigate("/night/new")}
                />
                <AppButton
                  title={`${pickerFirstName} can't make it`}
                  variant="ghost"
                  onPress={() => {}}
                />
              </View>
              {onDeck.length > 0 ? (
                <OnDeck label={`After ${pickerFirstName}`} members={onDeck} />
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
}));
