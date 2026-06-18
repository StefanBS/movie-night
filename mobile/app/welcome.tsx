import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Banner, Logomark } from "../components";
import {
  colors,
  fontFamily,
  fontSize,
  radius,
  space,
  textPresets,
  trackPx,
} from "../theme";

// The house rules shown on the first-run marquee. Echoes the in-app house rule
// (Settings) and FAIRNESS_NOTE (rotation), kept here as the screen's own copy.
const RULES = [
  "One pick a night. No voting, no vetoing.",
  "Fewest picks goes first — so everyone gets a fair turn.",
  "Can't make it? Skip your turn and keep your place.",
];

// EmberGlow is the top wash on the night-950 marquee — the same RadialGradient
// pattern as the Tonight hero (app/(tabs)/index.tsx). It is the screen's only
// ember (the disabled CTAs are not at ember rest).
function EmberGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="welcomeWash" cx="50%" cy="0%" rx="80%" ry="55%">
          <Stop offset="0" stopColor={colors.accent.base} stopOpacity={0.22} />
          <Stop offset="1" stopColor={colors.accent.base} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#welcomeWash)" />
    </Svg>
  );
}

// WelcomeScreen is the first-run marquee, shown when no group is resolved (see
// resolveGroupId in lib/api.ts). Presentational this phase: group create/join
// has no backend yet (unscheduled), so both CTAs are disabled behind a notice.
// Reached directly at /welcome for review — not wired into routing yet.
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <EmberGlow />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space[8],
            paddingBottom: insets.bottom + space[8],
          },
        ]}
      >
        <Logomark size={92} />
        <Text style={styles.wordmark}>Movie Night</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel} allowFontScaling={false}>
            HOW IT WORKS
          </Text>
          {RULES.map((rule, i) => (
            <Text key={rule} style={[styles.rule, i > 0 && styles.ruleGap]}>
              {rule}
            </Text>
          ))}
        </View>

        <View style={styles.banner}>
          <Banner tone="info">
            Creating and joining groups is coming soon.
          </Banner>
        </View>

        <View style={styles.actions}>
          <AppButton
            title="Start a group  →"
            fullWidth
            disabled
            onPress={() => {}}
          />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.dark },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[6],
  },
  wordmark: {
    ...textPresets.heroWordmark,
    color: colors.text.primary,
    marginTop: space[4],
    textAlign: "center",
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    padding: space[5],
    marginTop: space[8],
  },
  cardLabel: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
    marginBottom: space[3],
  },
  rule: { ...textPresets.body, color: colors.text.primary },
  ruleGap: { marginTop: space[3] },
  banner: { alignSelf: "stretch", marginTop: space[6] },
  actions: { alignSelf: "stretch", marginTop: space[6], gap: space[3] },
});
