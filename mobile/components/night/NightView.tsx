import { Platform, ScrollView, Text, View } from "react-native";
import { Clock } from "lucide-react-native";

import { AppButton, Avatar, Badge, Poster, SectionLabel, useToast } from "../";
import { WizardFooter } from "./WizardFooter";
import { addToCalendar } from "../../calendarExport";
import { formatShortDate, formatStartTime, weekday } from "../../lib/date";
import type { Member } from "../../lib/members";
import { nightTiming, nightWording } from "../../lib/nightLifecycle";
import { capitalize } from "../../lib/text";
import type { Night } from "../../lib/nights";
import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, radius, space, tabular, textPresets, trackPx, useColors } from "../../theme";

// NightView is the unified night terminal — one editable view for a night
// whatever its date or completeness. A night with a film leads with the film
// poster, one without with a date hero; the wording for its timing (badge,
// countdown, section labels) comes from nightWording. The film shows when set, with
// a "Change film" action; when unset, "Choose the film now". The picker and
// attendees render; editing the film re-enters PickStep, and "Edit night" (when
// onEdit is given) is the explicit way to change the date or who's coming.
// `today` is passed in (mirrors lib/date.ts) for deterministic date framing.
export function NightView({
  night,
  members,
  today,
  onDone,
  onPickFilm,
  onClearFilm,
  onEdit,
}: {
  night: Night;
  members: Member[];
  today: string;
  onDone: () => void;
  onPickFilm: () => void;
  onClearFilm?: () => void;
  onEdit?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const toast = useToast();
  const wording = nightWording(night.scheduledFor, today);
  // The OS calendar form has no web version.
  const canExport = wording.canAddToCalendar && Platform.OS !== "web";
  const movie = night.movie;
  // The picker of a night still ahead is the one "Next up"; a past night has no turn to mark.
  const ahead = nightTiming(night.scheduledFor, today) !== "past";
  // countdown is lowercase for use mid-sentence; the chip starts with it.
  const chipLabel = [wording.countdown, night.startTime !== null ? formatStartTime(night.startTime) : null]
    .filter((part) => part !== null)
    .join(" · ");
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  const onAddToCalendar = async () => {
    if ((await addToCalendar(night)) === "saved") {
      toast({ title: "Added to your calendar", body: "It won't follow later changes to the night." });
    }
  };
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {movie !== null ? (
          <View style={styles.filmHero}>
            <Poster uri={movie.posterUrl} title={movie.title} w={150} h={222} />
            <View style={styles.badgeWrap}>
              <Badge label={wording.badge} />
            </View>
            <Text style={styles.filmTitle} numberOfLines={3}>
              {movie.title}
            </Text>
            {movie.releaseYear !== null ? (
              <Text style={styles.filmYear}>{movie.releaseYear}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.dateHero}>
            <Badge label={wording.badge} />
            <Text style={styles.heroWeekday} allowFontScaling={false}>
              {weekday(night.scheduledFor, true)}
            </Text>
            <Text style={styles.heroDate} allowFontScaling={false}>
              {formatShortDate(night.scheduledFor)}
            </Text>
          </View>
        )}

        {wording.countdown !== null || night.startTime !== null ? (
          <View style={styles.countdownChip}>
            <Clock size={14} color={colors.text.secondary} />
            <Text style={styles.countdown} allowFontScaling={false}>
              {capitalize(chipLabel)}
            </Text>
          </View>
        ) : null}

        <SectionLabel>{wording.pickSection}</SectionLabel>
        <View style={styles.pickerRow}>
          <Avatar name={pickerName} size={40} />
          <View style={styles.pickerText}>
            <Text style={styles.pickerName} numberOfLines={1}>
              {wording.pickerTitle(pickerName)}
            </Text>
            <Text style={styles.pickerSub}>
              {wording.pickerSub}
            </Text>
          </View>
          {ahead ? <Badge label="Next up" tone="solid" /> : null}
        </View>

        <SectionLabel>{wording.attendeesSection(night.attendees.length)}</SectionLabel>
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
        <View style={styles.filmActionRow}>
          <AppButton
            title={movie !== null ? "Change film" : "Choose the film now →"}
            variant="ghost"
            size="sm"
            onPress={onPickFilm}
          />
          {movie !== null && onClearFilm !== undefined ? (
            <AppButton title="Clear film" variant="danger" size="sm" onPress={onClearFilm} />
          ) : null}
          {onEdit !== undefined ? (
            <AppButton title="Edit night" variant="ghost" size="sm" onPress={onEdit} />
          ) : null}
          {canExport ? (
            <AppButton title="Add to calendar" variant="ghost" size="sm" onPress={() => void onAddToCalendar()} />
          ) : null}
        </View>
      </WizardFooter>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  filmHero: { alignItems: "center", paddingTop: space[2] },
  badgeWrap: { marginTop: space[5] },
  // Stretch to the full width (textAlign centres the lines) instead of letting
  // filmHero's alignItems shrink-wrap the box to the measured text. On Android,
  // after the search keyboard opens, the title can draw wider than its
  // measurement, and a shrink-wrapped box clips the wrapped last word (#156).
  filmTitle: {
    alignSelf: "stretch",
    ...textPresets.filmTitle,
    fontSize: 40,
    lineHeight: 44,
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  filmYear: {
    fontFamily: fontFamily.sans,
    ...tabular,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  // A night without a film leads with its date, flush on the page: the
  // weekday set large and heavy, the date in italic serif under it.
  dateHero: { marginTop: space[6], alignItems: "flex-start" },
  heroWeekday: {
    fontFamily: fontFamily.display,
    fontSize: fontSize["4xl"],
    lineHeight: lh(fontSize["4xl"], "tight"),
    letterSpacing: trackPx(fontSize["4xl"], "display"),
    color: colors.text.primary,
    marginTop: space[4],
  },
  heroDate: {
    ...textPresets.filmTitle,
    fontSize: fontSize["2xl"],
    lineHeight: lh(fontSize["2xl"], "snug"),
    color: colors.text.primary,
    marginTop: space[1],
  },
  countdownChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: space[4],
    paddingVertical: 6,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: colors.surface.subtle,
  },
  countdown: { ...textPresets.meta, ...tabular, fontFamily: fontFamily.sansSemibold, fontSize: 13, color: colors.text.secondary },
  // The picker sits flush like any row, set heavier; the solid Next up badge is its mark.
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  pickerText: { flex: 1 },
  pickerName: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, "snug"),
    letterSpacing: trackPx(fontSize.lg, "title"),
    color: colors.text.primary,
  },
  pickerSub: { ...textPresets.meta, fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  cluster: { flexDirection: "row", paddingTop: space[2] },
  clusterAvatar: { borderRadius: radius.full, borderWidth: borderWidth.regular, borderColor: colors.surface.page },
  clusterOverlap: { marginLeft: -space[2] },
  filmActionRow: { alignItems: "center" },
}));
