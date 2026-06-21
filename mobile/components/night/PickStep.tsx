import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Avatar, Badge, Input, Poster, SectionLabel } from "../";
import { Stepper } from "./Stepper";
import type { Member } from "../../lib/members";
import type { Movie } from "../../lib/movies";
import type { Night } from "../../lib/nights";
import { borderWidth, colors, fontFamily, fontSize, pressedOpacity, radius, shadow, space, textPresets } from "../../theme";

function firstNameOf(name: string): string {
  return name.split(" ")[0];
}

// PickStep — the picker spotlight (with a correction reveal over present
// attendees), then film search. Selecting a result attaches the movie and
// advances; selection is the action, so this step has no footer CTA.
export function PickStep({
  night,
  members,
  busy,
  changingPicker,
  setChangingPicker,
  movieQuery,
  setMovieQuery,
  results,
  searching,
  searchError,
  onSearch,
  onAttach,
  onRecordPicker,
}: {
  night: Night;
  members: Member[];
  busy: string | null;
  changingPicker: boolean;
  setChangingPicker: (v: boolean) => void;
  movieQuery: string;
  setMovieQuery: (v: string) => void;
  results: Movie[];
  searching: boolean;
  searchError: string | null;
  onSearch: () => void;
  onAttach: (tmdbId: number) => void;
  onRecordPicker: (memberId: string) => void;
}) {
  const pickerName = members.find((m) => m.id === night.pickerId)?.name ?? "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stepper current={2} />

        <View style={styles.pickerCard}>
          <Avatar name={pickerName} size={44} glow />
          <View style={styles.rowText}>
            <Text style={styles.pickingTag}>{"✦ Picking tonight"}</Text>
            <Text style={styles.pickerName} numberOfLines={1}>
              {pickerName}
            </Text>
          </View>
        </View>

        <View style={styles.changeRow}>
          <AppButton
            title={
              changingPicker
                ? "Keep this picker"
                : `Not ${firstNameOf(pickerName)}? Choose who picks`
            }
            variant="ghost"
            onPress={() => setChangingPicker(!changingPicker)}
            disabled={busy !== null}
          />
        </View>
        {changingPicker
          ? night.attendees.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => onRecordPicker(a.id)}
                disabled={busy !== null}
                style={({ pressed }) => [styles.chooseRow, pressed && styles.rowPressed]}
              >
                <Avatar name={a.name} size={32} />
                <Text style={[styles.name, styles.rowText]} numberOfLines={1}>
                  {a.name}
                </Text>
                {busy === a.id ? (
                  <Text style={styles.tag}>…</Text>
                ) : night.pickerId === a.id ? (
                  <Badge label="Picking" />
                ) : null}
              </Pressable>
            ))
          : null}

        <SectionLabel>{"Find a film"}</SectionLabel>
        <Input
          value={movieQuery}
          onChangeText={setMovieQuery}
          placeholder="Search a film title…"
          onSubmitEditing={onSearch}
          addonLabel="Search"
          onAddonPress={onSearch}
        />
        {searchError !== null ? (
          <Text style={[styles.hint, styles.error]}>{searchError}</Text>
        ) : null}
        {searching ? (
          <ActivityIndicator style={styles.searchSpinner} color={colors.accent.base} />
        ) : null}

        {results.map((mv) => (
          <Pressable
            key={mv.tmdbId}
            onPress={() => onAttach(mv.tmdbId)}
            disabled={busy !== null}
            style={({ pressed }) => [styles.resultRow, pressed && styles.rowPressed]}
          >
            <Poster uri={mv.posterUrl} title={mv.title} w={42} h={63} />
            <View style={styles.rowText}>
              <Text style={styles.resultTitle} numberOfLines={2}>
                {mv.title}
              </Text>
              {mv.releaseYear !== null ? (
                <Text style={styles.resultYear}>{mv.releaseYear}</Text>
              ) : null}
            </View>
            {busy === String(mv.tmdbId) ? <Text style={styles.tag}>…</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[6],
  },
  hint: { ...textPresets.meta, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.text.danger },
  rowText: { flex: 1 },
  name: { ...textPresets.rowName, color: colors.text.primary },
  tag: { ...textPresets.tag, color: colors.text.secondary },
  rowPressed: { opacity: pressedOpacity },
  pickerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    marginTop: space[4],
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pickingTag: { ...textPresets.tag, color: colors.accent.strong },
  pickerName: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[1] },
  changeRow: { marginTop: space[2], alignItems: "flex-start" },
  chooseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  searchSpinner: { marginTop: space[3] },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  resultTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
    lineHeight: 22,
    color: colors.text.primary,
  },
  resultYear: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    marginTop: space[1],
  },
});
