import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Clock } from "lucide-react-native";

import { AppButton, Avatar, Badge, Poster, SectionLabel } from "../";
import { WizardFooter } from "./WizardFooter";
import { countdownLabel, daysUntil, formatShortDate, weekday } from "../../lib/date";
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

// NightView is the unified night terminal — one editable view for a night
// whatever its date or completeness. It frames by date: a future night leads
// with a date hero + countdown ("Scheduled ✓"); a tonight/past night with a
// film leads with the film poster ("Recorded ✓"). The film shows when set, with
// a "Change film" action; when unset, "Choose the film now". The picker and
// attendees render; editing the film re-enters PickStep. Replaces ScheduledStep
// + RecordedStep. `today` is passed in (mirrors lib/date.ts) for deterministic
// date framing.
export function NightView({
  night,
  members,
  today,
  onDone,
  onPickFilm,
}: {
  night: Night;
  members: Member[];
  today: string;
  onDone: () => void;
  onPickFilm: () => void;
}) {
  const future = daysUntil(night.scheduledFor, today) > 0;
  const movie = night.movie;
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {movie !== null ? (
          <View style={styles.filmHero}>
            <Poster uri={movie.posterUrl} title={movie.title} w={150} h={222} />
            <View style={styles.badgeWrap}>
              <Badge label={future ? "Scheduled ✓" : "Recorded ✓"} tone="solid" />
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
            <Badge label="Scheduled ✓" tone="solid" />
            <Text style={styles.heroWeekday} allowFontScaling={false}>
              {weekday(night.scheduledFor, true)}
            </Text>
            <Text style={styles.heroDate} allowFontScaling={false}>
              {formatShortDate(night.scheduledFor)}
            </Text>
          </View>
        )}

        {future ? (
          <View style={styles.countdownRow}>
            <Clock size={13} color={colors.accent.strong} />
            <Text style={styles.countdown} allowFontScaling={false}>
              {countdownLabel(night.scheduledFor)}
            </Text>
          </View>
        ) : null}

        <SectionLabel>{future ? "On the night" : "The pick"}</SectionLabel>
        <View style={styles.pickerRow}>
          <Avatar name={pickerName} size={40} glow />
          <View style={styles.pickerText}>
            <Text style={styles.pickerName} numberOfLines={1}>
              {future ? `${pickerName} picks` : pickerName}
            </Text>
            <Text style={styles.pickerSub} allowFontScaling={false}>
              {future ? "CHOOSES THE FILM THAT NIGHT" : `PICKED · ${formatShortDate(night.scheduledFor)}`}
            </Text>
          </View>
          <Badge label="✦ Up" uppercase={false} />
        </View>

        <SectionLabel>{future ? `Coming · ${night.attendees.length}` : "Who watched"}</SectionLabel>
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
            title={movie !== null ? "Change film" : "Choose the film now  →"}
            variant="ghost"
            onPress={onPickFilm}
          />
        </View>
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[6] },
  filmHero: { alignItems: "center", paddingTop: space[2] },
  badgeWrap: { marginTop: space[5] },
  filmTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: trackPx(34, "display"),
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  filmYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  dateHero: {
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
  countdownRow: { flexDirection: "row", alignItems: "center", gap: space[1], marginTop: space[4] },
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
  clusterAvatar: { borderRadius: radius.full, borderWidth: borderWidth.regular, borderColor: colors.surface.page },
  clusterOverlap: { marginLeft: -space[2] },
  filmActionRow: { alignItems: "center" },
});
