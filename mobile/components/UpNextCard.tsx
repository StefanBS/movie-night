import { Pressable, Text, View } from "react-native";

import { AppButton } from "./AppButton";
import { Avatar } from "./Avatar";
import { Poster } from "./Poster";
import { firstName } from "../lib/avatar";
import { formatStartTime, formatWeekdayDate } from "../lib/date";
import { movieDetails } from "../lib/movies";
import { nightWording, upNextAction } from "../lib/nightLifecycle";
import { nightPicker, type Night } from "../lib/nights";
import { formatRepeatShort } from "../lib/repeat";
import { capitalize } from "../lib/text";
import {
  borderWidth,
  createThemedStyles,
  fontFamily,
  fontSize,
  lh,
  pressedOpacity,
  radius,
  space,
  tabular,
  textPresets,
  trackPx,
} from "../theme";

const MAX_AVATARS = 4; // overlapping "coming" faces
const POSTER_W = 88;
const POSTER_H = 132;

// UpNextCard is the home's scheduled-night card: when a night is on the
// calendar, the home leads with it instead of the whose-turn hero. The film
// leads: its 88×132 poster (or the hue tile) beside the title in
// textPresets.filmTitle at text-2xl, never truncated, then year, genres and
// length on a line each (any we don't have are left out). The text block sits
// on the poster's bottom edge. The picker is credited on one body-size line
// beneath ("Picked by Tomas"). Before the film is chosen an empty outlined
// slot sits beside "Not picked yet." in tertiary text and the credit reads
// "Tomas is picking".
//
// The primary button is the next thing the group has to do (upNextAction):
// "Choose the film" with no film yet, "We watched it" once the film is chosen
// and the night is due, and none while the night is still ahead. "Edit" is
// always there, alone and at its natural width when there is no primary.
// Tapping the card outside the buttons opens the night: the body is one
// Pressable and the button row its sibling, so a button press never reaches
// it and TalkBack still sees each button. The body has no explicit label, so
// TalkBack reads all of its text: date, film, credit and who's coming. A
// repeating night's date line ends with its cadence ("Weekly") and may wrap
// to a second line rather than cut it off. The accent is only the date-line
// dot and the primary button; nothing glows.
export function UpNextCard({
  night,
  today,
  onChooseFilm,
  onWatched,
  onOpen,
  onEdit,
}: {
  night: Night;
  today: string;
  onChooseFilm: () => void;
  onWatched: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const styles = useStyles();
  const movie = night.movie;
  const details = movie !== null ? movieDetails(movie) : [];
  const picker = nightPicker(night);
  const wording = nightWording(night.scheduledFor, today);
  const when = [
    wording.countdown,
    formatWeekdayDate(night.scheduledFor),
    night.startTime !== null ? formatStartTime(night.startTime) : null,
    night.repeat !== null ? formatRepeatShort(night.repeat) : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  const action = upNextAction(night, today);
  const primary =
    action === "chooseFilm"
      ? { title: "Choose the film", onPress: onChooseFilm }
      : action === "watched"
        ? { title: "We watched it", onPress: onWatched }
        : null;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityHint="Opens the night"
        style={({ pressed }) => pressed && styles.pressed}
      >
        <View style={styles.whenRow}>
          <View style={styles.dot} />
          <Text style={styles.when} numberOfLines={2}>
            {capitalize(when)}
          </Text>
        </View>

        <View style={styles.filmRow}>
          {movie !== null ? (
            <View style={styles.posterShadow}>
              <Poster
                uri={movie.posterUrl}
                title={movie.title}
                year={movie.releaseYear ?? undefined}
                w={POSTER_W}
                h={POSTER_H}
              />
            </View>
          ) : (
            <View style={styles.emptyPoster} />
          )}
          <View style={styles.filmText}>
            <Text style={[styles.title, movie === null && styles.titlePending]}>
              {movie !== null ? movie.title : "Not picked yet."}
            </Text>
            {details.length > 0 ? (
              <View style={styles.details}>
                {details.map((d) => (
                  <Text
                    key={d.kind}
                    style={[styles.detail, d.kind !== "genres" && styles.detailNumeric]}
                    numberOfLines={1}
                  >
                    {d.text}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>

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
      </Pressable>

      <View style={styles.actions}>
        {primary !== null ? (
          <View style={styles.primaryWrap}>
            <AppButton title={primary.title} fullWidth onPress={primary.onPress} />
          </View>
        ) : null}
        <AppButton title="Edit" variant="secondary" onPress={onEdit} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors, shadow) => ({
  card: {
    borderRadius: radius.xl,
    paddingTop: space[6],
    paddingHorizontal: space[5],
    paddingBottom: space[5],
    backgroundColor: colors.surface.card,
  },
  pressed: { opacity: pressedOpacity },
  // The dot sits on the first line's centre, should the line wrap.
  whenRow: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  dot: {
    width: 8,
    height: 8,
    marginTop: (lh(fontSize.sm, "normal") - 8) / 2,
    borderRadius: radius.full,
    backgroundColor: colors.accent.base,
  },
  // No tabular figures: this line is prose ("Monday, Nov 2") and Schibsted's
  // tabular comma would open a gap before it.
  when: {
    ...textPresets.meta,
    fontFamily: fontFamily.sansSemibold,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  filmRow: { flexDirection: "row", alignItems: "flex-end", gap: space[4], marginTop: space[4] },
  // shadow.sm sits on a wrapper: Poster clips its own corners.
  posterShadow: { borderRadius: radius.sm, ...shadow.sm },
  emptyPoster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: radius.sm,
    boxShadow: `inset 0 0 0 ${borderWidth.regular}px ${colors.border.strong}`,
  },
  filmText: { flex: 1, minWidth: 0, paddingBottom: 2 },
  // The film leads. Sized from the filmTitle preset so the face comes from
  // one place. No numberOfLines: the title always shows in full.
  title: {
    ...textPresets.filmTitle,
    fontSize: fontSize["2xl"],
    lineHeight: Math.round(fontSize["2xl"] * 1.08),
    letterSpacing: trackPx(fontSize["2xl"], "film"),
    color: colors.text.primary,
  },
  titlePending: { color: colors.text.tertiary },
  details: { marginTop: space[2] },
  detail: {
    ...textPresets.meta,
    lineHeight: Math.round(fontSize.sm * 1.4),
    color: colors.text.tertiary,
  },
  // Year and length only: genres are prose, and Schibsted's tabular comma
  // would open a gap after each one.
  detailNumeric: tabular,
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
  primaryWrap: { flex: 1 },
}));
