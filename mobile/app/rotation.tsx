import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton, Badge, Banner, MemberRow, TopBar } from "../components";
import { useLoad } from "../components/useLoad";
import { API_URL } from "../apiUrl";
import { firstName } from "../lib/avatar";
import { GROUP_ID } from "../lib/api";
import { fetchTurn, pickerMeta, type TurnMember } from "../lib/turn";
import { createThemedStyles, space, textPresets, useColors } from "../theme";

// The fairness rule, stated plainly — the same logic the backend's turn query
// implements (fewest picks first, ties broken by who picked longest ago).
const FAIRNESS_NOTE =
  "Fewest picks goes first. Ties go to whoever picked longest ago, so everyone gets a fair turn. No voting.";

// Rank 1 is the picker — a highlighted name and the Next up badge. The rest
// follow in turn order; every row sits flush with a hairline below it.
function RotationList({ order }: { order: TurnMember[] }) {
  const styles = useStyles();
  const [picker, ...rest] = order;
  return (
    <View style={styles.list}>
      <MemberRow
        rank={1}
        name={picker.name}
        meta={pickerMeta(picker)}
        highlighted
        divider={rest.length > 0}
        right={<Badge label="Next up" tone="solid" />}
      />
      {rest.map((m, i) => (
        <MemberRow
          key={m.id}
          rank={i + 2}
          name={m.name}
          meta={pickerMeta(m)}
          divider={i < rest.length - 1}
        />
      ))}
    </View>
  );
}

export default function RotationScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  // A stack screen opened from Tonight, so it loads once on mount.
  const { data: order, loading, error } = useLoad(
    (signal) => fetchTurn(API_URL, GROUP_ID, signal),
    [] as TurnMember[],
    "failed to load the rotation",
    { refetchOnFocus: false },
  );

  const leadFirstName = order.length > 0 ? firstName(order[0].name) : "";

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="The order"
        back={{ label: "Tonight", onPress: () => router.back() }}
      />
      {loading ? (
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.text.secondary}
        />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load the rotation: ${error}`}
        </Text>
      ) : order.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the rotation yet."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Banner>{FAIRNESS_NOTE}</Banner>

          <RotationList order={order} />

          <View style={styles.skipRow}>
            {/* UI only — the skip-turn endpoint is tracked separately (#42). */}
            <AppButton
              title={`Skip ${leadFirstName}'s turn`}
              variant="secondary"
              onPress={() => {}}
            />
          </View>

          <Text style={styles.footer}>
            {"Guests and inactive members don't enter the rotation."}
          </Text>
        </ScrollView>
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
    paddingBottom: space[10],
  },
  list: { marginTop: space[3] },
  skipRow: { marginTop: space[5], alignItems: "center" },
  footer: {
    ...textPresets.meta,
    color: colors.text.tertiary,
    textAlign: "center",
    marginTop: space[6],
  },
}));
