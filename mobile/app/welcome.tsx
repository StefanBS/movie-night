import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Banner, Logomark } from "../components";
import { borderWidth, createThemedStyles, fontFamily, fontSize, space, tabular, textPresets } from "../theme";

// The house rules shown on the first-run marquee. Echoes the in-app house rule
// (Settings) and FAIRNESS_NOTE (rotation), kept here as the screen's own copy.
const RULES = [
  "One pick a night. No voting, no vetoing.",
  "Fewest picks goes first, so everyone gets a fair turn.",
  "Can't make it? Skip your turn and keep your place.",
];

// WelcomeScreen is the first-run marquee, shown when no group is resolved (see
// resolveGroupId in lib/api.ts). Presentational this phase: group create/join
// has no backend yet (unscheduled), so both CTAs are disabled behind a notice.
// Reached directly at /welcome for review — not wired into routing yet.
export default function WelcomeScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space[8],
            paddingBottom: insets.bottom + space[8],
          },
        ]}
      >
        <View style={styles.marquee}>
          <Logomark size={56} />
          <Text style={styles.wordmark}>{"Movie\nNight"}</Text>
          <Text style={styles.tagline}>Everyone gets their turn.</Text>

          <View style={styles.rules}>
            {RULES.map((rule, i) => (
              <View key={rule} style={styles.ruleRow}>
                <Text style={styles.ruleNumber}>{i + 1}</Text>
                <Text style={styles.rule}>{rule}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <Banner tone="info">Creating and joining groups is coming soon.</Banner>
          <AppButton title="Start a group" fullWidth disabled onPress={() => {}} />
          <AppButton
            title="Enter an invite code"
            variant="ghost"
            fullWidth
            disabled
            onPress={() => {}}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const TAGLINE = 24;

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { flexGrow: 1, paddingHorizontal: 28 },
  marquee: { flex: 1, justifyContent: "center" },
  wordmark: {
    ...textPresets.heroWordmark,
    color: colors.text.primary,
    marginTop: 26,
  },
  tagline: {
    ...textPresets.filmTitle,
    fontSize: TAGLINE,
    lineHeight: Math.round(TAGLINE * 1.2),
    color: colors.text.primary,
    marginTop: 14,
  },
  rules: { marginTop: space[8] },
  ruleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 14,
    paddingVertical: space[3],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
  },
  ruleNumber: {
    fontFamily: fontFamily.sansBold,
    ...tabular,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
  },
  rule: { ...textPresets.body, color: colors.text.primary, flex: 1 },
  actions: { marginTop: space[8], gap: space[3] },
}));
