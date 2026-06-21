import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";

import { AppButton, Avatar, Badge, SectionLabel } from "../";
import { WizardFooter } from "./WizardFooter";
import { countdownLabel, formatShortDate, weekday } from "../../lib/date";
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

// ScheduledStep is the future-night terminal: the date hero with a countdown, the
// locked picker (who chooses the film on the night), and who's coming. Recurrence,
// calendar export, and notify are later phases and intentionally absent.
export function ScheduledStep({
  night,
  members,
  onDone,
}: {
  night: Night;
  members: Member[];
  onDone: () => void;
}) {
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Badge label="Scheduled ✓" tone="solid" />
          <Text style={styles.heroWeekday} allowFontScaling={false}>
            {weekday(night.scheduledFor, true)}
          </Text>
          <Text style={styles.heroDate} allowFontScaling={false}>
            {formatShortDate(night.scheduledFor)}
          </Text>
          <View style={styles.countdownRow}>
            <Clock size={13} color={colors.accent.strong} />
            <Text style={styles.countdown} allowFontScaling={false}>
              {countdownLabel(night.scheduledFor)}
            </Text>
          </View>
        </View>

        <SectionLabel>{"On the night"}</SectionLabel>
        <View style={styles.pickerRow}>
          <Avatar name={pickerName} size={40} glow />
          <View style={styles.pickerText}>
            <Text style={styles.pickerName} numberOfLines={1}>
              {`${pickerName} picks`}
            </Text>
            <Text style={styles.pickerSub} allowFontScaling={false}>
              {"CHOOSES THE FILM THAT NIGHT"}
            </Text>
          </View>
          <Badge label="✦ Up" uppercase={false} />
        </View>

        <SectionLabel>{`Coming · ${night.attendees.length}`}</SectionLabel>
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
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  hero: {
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
  countdownRow: { flexDirection: "row", alignItems: "center", gap: space[1], marginTop: space[3] },
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
  clusterAvatar: { borderRadius: radius.full, borderWidth: 3, borderColor: colors.surface.page },
  clusterOverlap: { marginLeft: -space[2] },
});
