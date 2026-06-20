import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Avatar, Badge, Poster, SectionLabel } from "../";
import { WizardFooter } from "./WizardFooter";
import { formatShortDate } from "../../lib/date";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
import { colors, fontFamily, fontSize, radius, space, textPresets, trackPx } from "../../theme";

// RecordedStep — the finished-night hero: poster, RECORDED badge, title/year,
// who picked, and the who-watched cluster. Renders nothing if the movie is
// somehow absent (the container only mounts it when night.movie is set).
export function RecordedStep({
  night,
  members,
  onDone,
  onChangeMovie,
}: {
  night: Night;
  members: Member[];
  onDone: () => void;
  onChangeMovie: () => void;
}) {
  if (night.movie === null) {
    return null;
  }
  const movie = night.movie;
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.recordedContent}>
        <Poster uri={movie.posterUrl} title={movie.title} w={150} h={222} />
        <View style={styles.recordedBadge}>
          <Badge label="Recorded ✓" tone="solid" />
        </View>
        <Text style={styles.recordedTitle} numberOfLines={3}>
          {movie.title}
        </Text>
        {movie.releaseYear !== null ? (
          <Text style={styles.recordedYear}>{movie.releaseYear}</Text>
        ) : null}

        <View style={styles.pickedBy}>
          <Avatar name={pickerName} size={28} />
          <Text style={styles.pickedByText}>
            {"Picked by "}
            <Text style={styles.pickedByName}>{pickerName}</Text>
            {` · ${formatShortDate(night.scheduledFor)}`}
          </Text>
        </View>

        <SectionLabel>{"Who watched"}</SectionLabel>
        <View style={styles.watchedCluster}>
          {night.attendees.map((a, i) => (
            <View key={a.id} style={[styles.watchedAvatar, i > 0 && styles.watchedOverlap]}>
              <Avatar name={a.name} size={40} />
            </View>
          ))}
        </View>
      </ScrollView>
      <WizardFooter>
        <AppButton title="Done — back to rotation" fullWidth onPress={onDone} />
        <View style={styles.changeMovieRow}>
          <AppButton title="Change movie" variant="ghost" onPress={onChangeMovie} />
        </View>
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  recordedContent: {
    paddingHorizontal: space[5],
    paddingTop: space[5],
    paddingBottom: space[6],
    alignItems: "center",
  },
  recordedBadge: { marginTop: space[5] },
  recordedTitle: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: trackPx(34, "display"),
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  recordedYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  pickedBy: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[5] },
  pickedByText: { ...textPresets.meta, color: colors.text.secondary },
  pickedByName: { color: colors.text.primary, fontFamily: fontFamily.sansSemibold },
  watchedCluster: { flexDirection: "row", justifyContent: "center", paddingTop: space[2] },
  watchedAvatar: {
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.surface.page,
  },
  watchedOverlap: { marginLeft: -space[2] },
  changeMovieRow: { alignItems: "center" },
});
