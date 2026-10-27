import { Text, StyleSheet } from "react-native";

import { PickStep } from "./PickStep";
import { NightView } from "./NightView";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
import type { Movie } from "../../lib/movies";
import { colors, space, textPresets } from "../../theme";

// Step is where the editor for a saved Night is: the film/picker step, or the
// Night view it rests on. Attendance is planned before the Night exists
// (WhoStep) and edited afterwards on the Edit screen.
export type Step = "pick" | "night";

// NightSteps renders the Pick / Night body for an existing night.
export function NightSteps({
  night,
  members,
  today,
  step,
  busy,
  actionError,
  future,
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
  onSkipPick,
  onDone,
  onPickFilm,
  onClearFilm,
  onEdit,
}: {
  night: Night;
  members: Member[];
  today: string;
  step: Step;
  busy: string | null;
  actionError: string | null;
  future: boolean;
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
  onSkipPick: () => void;
  onDone: () => void;
  onPickFilm: () => void;
  onClearFilm?: () => void;
  onEdit?: () => void;
}) {
  return (
    <>
      {actionError !== null ? (
        <Text style={[styles.banner, styles.error]}>{actionError}</Text>
      ) : null}
      {step === "pick" ? (
        <PickStep
          night={night}
          members={members}
          busy={busy}
          future={future}
          changingPicker={changingPicker}
          setChangingPicker={setChangingPicker}
          movieQuery={movieQuery}
          setMovieQuery={setMovieQuery}
          results={results}
          searching={searching}
          searchError={searchError}
          onSearch={onSearch}
          onAttach={onAttach}
          onRecordPicker={onRecordPicker}
          onSkip={onSkipPick}
        />
      ) : (
        <NightView
          night={night}
          members={members}
          today={today}
          onDone={onDone}
          onPickFilm={onPickFilm}
          onClearFilm={onClearFilm}
          onEdit={onEdit}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
});
