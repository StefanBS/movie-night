import { Text, View } from "react-native";

import { AppButton } from "./AppButton";
import { Avatar } from "./Avatar";
import { firstName } from "../lib/avatar";
import { formatStartTime, formatWeekdayDate } from "../lib/date";
import { nightWording } from "../lib/nightLifecycle";
import type { Night } from "../lib/nights";
import { capitalize } from "../lib/text";
import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, radius, space, tabular, textPresets, trackPx } from "../theme";

const MAX_AVATARS = 4; // overlapping "coming" faces

// UpNextCard is the home's scheduled-night card: when a night is on the
// calendar, the home leads with it instead of the whose-turn hero. The
// picker's first name is the headline, with the film (once chosen) in
// Newsreader Italic below it. A small accent dot marks the date line; nothing
// glows. Edit routes to /night/edit/[id].
export function UpNextCard({
  night,
  today,
  onStart,
  onEdit,
}: {
  night: Night;
  today: string;
  onStart: () => void;
  onEdit: () => void;
}) {
  const styles = useStyles();
  const picker = night.attendees.find((a) => a.id === night.pickerId) ?? null;
  const wording = nightWording(night.scheduledFor, today);
  const when = [
    wording.countdown,
    formatWeekdayDate(night.scheduledFor),
    night.startTime !== null ? formatStartTime(night.startTime) : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <View style={styles.card}>
      <View style={styles.whenRow}>
        <View style={styles.dot} />
        <Text style={styles.when} numberOfLines={1}>
          {capitalize(when)}
        </Text>
      </View>

      {picker !== null ? (
        <View style={styles.pickerRow}>
          <View style={styles.pickerText}>
            <Text style={styles.pickerName} numberOfLines={1} allowFontScaling={false}>
              {firstName(picker.name)}
            </Text>
            <Text style={styles.film} numberOfLines={2}>
              {night.movie !== null ? `${night.movie.title}.` : "picks the film."}
            </Text>
          </View>
          <Avatar name={picker.name} size={48} />
        </View>
      ) : null}

      {night.attendees.length > 0 ? (
        <View style={styles.comingRow}>
          <View style={styles.avatars}>
            {night.attendees.slice(0, MAX_AVATARS).map((a, i) => (
              <View key={a.id} style={[styles.avatarChip, i > 0 && styles.avatarOverlap]}>
                <Avatar name={a.name} size={26} />
              </View>
            ))}
          </View>
          <Text style={styles.coming}>{`${night.attendees.length} coming`}</Text>
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

const useStyles = createThemedStyles((colors) => ({
  card: {
    borderRadius: radius.xl,
    paddingTop: space[6],
    paddingHorizontal: space[5],
    paddingBottom: space[5],
    backgroundColor: colors.surface.card,
  },
  whenRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.accent.base },
  // No tabular figures: this line is prose ("Monday, Nov 2") and Schibsted's
  // tabular comma would open a gap before it.
  when: {
    ...textPresets.meta,
    fontFamily: fontFamily.sansSemibold,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: space[3],
    marginTop: space[4],
  },
  pickerText: { flex: 1, minWidth: 0 },
  pickerName: {
    fontFamily: fontFamily.display,
    fontSize: fontSize["4xl"],
    // leading-tight (0.9) clips the name's ascenders in RN, so it sits at 1.
    lineHeight: lh(fontSize["4xl"], "none"),
    letterSpacing: trackPx(fontSize["4xl"], "display"),
    color: colors.text.primary,
  },
  film: {
    fontFamily: fontFamily.serifItalic,
    fontSize: 26,
    lineHeight: Math.round(26 * 1.15),
    color: colors.text.primary,
    marginTop: 6,
  },
  comingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: space[5],
    paddingTop: space[4],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
  },
  avatars: { flexDirection: "row", alignItems: "center" },
  // A 2px ring in the card colour separates the overlapping faces.
  avatarChip: {
    borderRadius: radius.full,
    boxShadow: `0 0 0 ${borderWidth.ring}px ${colors.surface.card}`,
  },
  avatarOverlap: { marginLeft: -space[2] },
  coming: { ...textPresets.meta, ...tabular, color: colors.text.secondary },
  actions: { flexDirection: "row", gap: space[3], marginTop: space[5] },
  startWrap: { flex: 1 },
}));
