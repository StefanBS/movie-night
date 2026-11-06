import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { AppButton, Avatar, Badge, Input, Poster } from "../";
import { Credit } from "./Credit";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { firstName } from "../../lib/avatar";
import { formatShortDate } from "../../lib/date";
import type { SearchResult } from "../../lib/movies";
import { nightWording } from "../../lib/nightLifecycle";
import { nightPicker, type Night } from "../../lib/nights";
import { borderWidth, createThemedStyles, fontFamily, lh, pressedOpacity, space, tabular, textPresets, useColors } from "../../theme";

// How long typing has to pause before the search runs.
const SEARCH_DEBOUNCE_MS = 300;

// PickStep opens on "What are we watching?" with the picker as a credit line
// (its "Change" reveals the night's attendees to hand the pick to), then the
// film search, which runs as you type. Films the group has already watched say
// when. Selecting a result attaches it and returns to the Night, so the step
// has no main action, only "Skip for now". The search text and the reveal are
// view-only state, so they live here; everything that touches the server comes
// from the editor (lib/nightEditor).
export function PickStep({
  night,
  today,
  busy,
  results,
  resultsFor,
  searching,
  searchError,
  onSearch,
  onAttach,
  onChangePicker,
  onSkip,
}: {
  night: Night;
  today: string;
  busy: string | null;
  results: SearchResult[];
  resultsFor: string;
  searching: boolean;
  searchError: string | null;
  onSearch: (query: string) => void;
  onAttach: (tmdbId: number) => void;
  onChangePicker: (memberId: string) => Promise<Night | null>;
  onSkip?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [movieQuery, setMovieQuery] = useState("");
  const [changingPicker, setChangingPicker] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => onSearch(movieQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [movieQuery, onSearch]);

  const choosePicker = async (memberId: string) => {
    if ((await onChangePicker(memberId)) !== null) {
      setChangingPicker(false);
    }
  };
  const pickerName = nightPicker(night).name;
  const first = firstName(pickerName);
  const wording = nightWording(night.scheduledFor, today);
  const query = movieQuery.trim();
  const answered = query !== "" && resultsFor === query && !searching;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Stepper current={2} />
        <Text style={styles.heading}>What are we watching?</Text>

        <View style={styles.credit}>
          <Credit
            name={pickerName}
            pending
            action={
              <AppButton
                title={changingPicker ? "Cancel" : "Change"}
                variant="ghost"
                size="sm"
                strong
                onPress={() => setChangingPicker(!changingPicker)}
                disabled={busy !== null}
              />
            }
          />
        </View>
        {changingPicker
          ? night.attendees.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => void choosePicker(a.id)}
                disabled={busy !== null}
                style={({ pressed }) => [styles.row, styles.chooseRow, pressed && styles.rowPressed]}
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

        <View style={styles.search}>
          <Input
            value={movieQuery}
            onChangeText={setMovieQuery}
            placeholder="Search a film title…"
            onSubmitEditing={() => onSearch(movieQuery)}
          />
        </View>
        {searchError !== null ? <Text style={[styles.hint, styles.error]}>{searchError}</Text> : null}
        {searching && results.length === 0 ? (
          <ActivityIndicator style={styles.searchSpinner} color={colors.text.secondary} />
        ) : null}
        {answered && results.length === 0 && searchError === null ? (
          <Text style={styles.hint}>No films match that title.</Text>
        ) : null}
        {query !== "" && results.length > 0 ? (
          <Text style={[styles.hint, styles.count]}>
            {`${results.length} ${results.length === 1 ? "film" : "films"} · tap one to make it ${first}'s pick`}
          </Text>
        ) : null}

        {query !== ""
          ? results.map((mv, i) => {
              const meta = [mv.releaseYear, mv.watchedOn !== null ? `watched ${formatShortDate(mv.watchedOn)}` : null]
                .filter((part) => part !== null)
                .join(" · ");
              return (
                <Pressable
                  key={mv.tmdbId}
                  onPress={() => onAttach(mv.tmdbId)}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.row, i < results.length - 1 && styles.divider, pressed && styles.rowPressed]}
                >
                  <Poster uri={mv.posterUrl} title={mv.title} w={44} h={66} />
                  <View style={styles.rowText}>
                    <Text style={styles.resultTitle} numberOfLines={2}>
                      {mv.title}
                    </Text>
                    {meta !== "" ? <Text style={styles.resultMeta}>{meta}</Text> : null}
                  </View>
                  {busy === String(mv.tmdbId) ? <Text style={styles.tag}>…</Text> : null}
                </Pressable>
              );
            })
          : null}
      </ScrollView>
      {onSkip ? (
        <WizardFooter>
          <AppButton title={wording.skipLabel(first)} variant="ghost" onPress={onSkip} disabled={busy !== null} />
        </WizardFooter>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[6],
  },
  heading: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[6] },
  credit: { marginTop: 14 },
  search: { marginTop: space[5] },
  hint: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[3] },
  count: { fontSize: 13, lineHeight: lh(13), color: colors.text.tertiary, ...tabular },
  error: { ...textPresets.body, color: colors.text.danger },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...textPresets.rowName, color: colors.text.primary },
  tag: { ...textPresets.tag, color: colors.text.secondary },
  rowPressed: { opacity: pressedOpacity },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.border.hairline },
  chooseRow: {
    gap: space[3],
    paddingHorizontal: space[2],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  searchSpinner: { marginTop: space[3] },
  resultTitle: {
    fontFamily: fontFamily.serifMedium,
    fontSize: 19,
    lineHeight: 21,
    color: colors.text.primary,
  },
  resultMeta: {
    fontFamily: fontFamily.sans,
    ...tabular,
    fontSize: 13,
    lineHeight: lh(13),
    color: colors.text.tertiary,
    marginTop: 3,
  },
}));
