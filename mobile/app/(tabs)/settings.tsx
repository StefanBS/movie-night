import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { ChevronRight } from "lucide-react-native";

import { Banner, SectionLabel, SettingsRow, Toggle, TopBar } from "../../components";
import { GROUP_NAME } from "../../lib/api";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  space,
  textPresets,
  trackPx,
} from "../../theme";

export default function SettingsScreen() {
  // TODO(#41): settings persistence + house-rule editing land here. Until the
  // group-settings endpoint exists, toggles are session-local (reset on
  // reload) and the Notifications / Danger-zone rows are inert.
  const [allowSkipping, setAllowSkipping] = useState(true); // skip exists in-app
  const [guestsCanPick, setGuestsCanPick] = useState(false); // the house rule
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Settings" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarHeight + space[5] },
        ]}
      >
        <View style={styles.ruleCard}>
          <Text style={styles.ruleKicker} allowFontScaling={false}>
            THE HOUSE RULE
          </Text>
          <Text style={styles.ruleText}>
            One pick a night. No voting, no vetoing.
          </Text>
        </View>

        <Banner tone="info">
          {"Settings aren’t saved yet — changes reset when you reopen the app."}
        </Banner>

        <SectionLabel>Group</SectionLabel>
        <View style={styles.card}>
          <SettingsRow label={GROUP_NAME} />
        </View>

        <SectionLabel>Rotation</SectionLabel>
        <View style={styles.card}>
          <View style={styles.divider}>
            <SettingsRow
              label="Allow skipping"
              right={
                <Toggle value={allowSkipping} onValueChange={setAllowSkipping} />
              }
            />
          </View>
          <SettingsRow
            label="Guests can pick"
            right={
              <Toggle value={guestsCanPick} onValueChange={setGuestsCanPick} />
            }
          />
        </View>

        <SectionLabel>Notifications</SectionLabel>
        <View style={styles.card}>
          <SettingsRow
            label="Reminders & nudges"
            disabled
            right={<ChevronRight size={18} color={colors.text.tertiary} />}
          />
        </View>

        <SectionLabel>Danger zone</SectionLabel>
        <View style={styles.card}>
          <View style={styles.divider}>
            <SettingsRow label="Reset history" danger disabled />
          </View>
          <SettingsRow label="Leave group" danger disabled />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  // paddingBottom is applied inline from the live tab bar height (the bar is
  // absolutely positioned and would otherwise hide the last row).
  content: { paddingHorizontal: space[5] },
  ruleCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    padding: space[5],
    marginTop: space[6],
    marginBottom: space[4],
    gap: space[2],
  },
  ruleKicker: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
  ruleText: { ...textPresets.screenTitle, color: colors.text.primary },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
});
