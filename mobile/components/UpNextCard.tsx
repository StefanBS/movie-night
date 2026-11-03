import { Text, View } from "react-native";

import { AppButton } from "./AppButton";
import { Avatar } from "./Avatar";
import { firstName } from "../lib/avatar";
import { formatStartTime, formatWeekdayDate } from "../lib/date";
import { nightWording } from "../lib/nightLifecycle";
import type { Night } from "../lib/nights";
import { capitalize } from "../lib/text";
import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, radius, space, tabular, textPresets } from "../theme";

const MAX_AVATARS = 4; // overlapping "coming" faces

// UpNextCard is the home's scheduled-night card: when a night is on the
// calendar, the home leads with it instead of the whose-turn hero. The film is
// the headline (textPresets.filmTitle at text-3xl), with the picker credited
// on one body-size line beneath it ("Picked by Tomas"). Before the film is
// chosen the headline reads "Not picked yet." in tertiary text and the credit
// reads "Tomas is picking". The accent is only the date-line dot and "Start
// the night"; nothing glows. Edit routes to /night/edit/[id].
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

      <Text
        style={[styles.title, night.movie === null && styles.titlePending]}
        numberOfLines={3}
      >
        {night.movie !== null ? night.movie.title : "Not picked yet."}
      </Text>

      {picker !== null ? (
        <View style={styles.creditRow}>
          <Avatar name={picker.name} size={28} />
          <Text style={styles.credit} numberOfLines={1}>
            {night.movie !== null ? (
              <>
                {"Picked by "}
                <Text style={styles.creditName}>{firstName(picker.name)}</Text>
              </>
            ) : (
              <>
                <Text style={styles.creditName}>{firstName(picker.name)}</Text>
                {" is picking"}
              </>
            )}
          </Text>
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
  // The film leads. Sized up from the filmTitle preset so the face (and its
  // Phase 2 change to upright Newsreader 500) comes from one place.
  title: {
    ...textPresets.filmTitle,
    fontSize: fontSize["3xl"],
    lineHeight: lh(fontSize["3xl"], "snug"),
    color: colors.text.primary,
    marginTop: space[4],
  },
  titlePending: { color: colors.text.tertiary },
  creditRow: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[4] },
  // The picker's name stays at body size here; it's a credit, not a headline.
  credit: { ...textPresets.body, color: colors.text.secondary, flexShrink: 1 },
  creditName: { fontFamily: fontFamily.sansSemibold, color: colors.text.primary },
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
