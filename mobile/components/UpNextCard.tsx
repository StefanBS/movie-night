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
