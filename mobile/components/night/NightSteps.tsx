import { Text, StyleSheet } from "react-native";

import { WhoStep } from "./WhoStep";
import { PickStep } from "./PickStep";
import { NightView } from "./NightView";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
import type { Step } from "../../lib/nightFlow";
import type { TurnMember } from "../../lib/turn";
import type { Movie } from "../../lib/movies";
import { colors, space, textPresets } from "../../theme";

// NightSteps renders the Who / Pick / Night wizard body for an existing night.
export function NightSteps({
  night,
  members,
  today,
  step,
  order,
  attendeeIds,
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
  onToggle,
  onAdvance,
  onSearch,
  onAttach,
  onRecordPicker,
  onSkipPick,
  onDone,
  onPickFilm,
}: {
  night: Night;
  members: Member[];
  today: string;
  step: Step;
  order: TurnMember[];
  attendeeIds: Set<string>;
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
  onToggle: (m: Member) => void;
  onAdvance: () => void;
  onSearch: () => void;
  onAttach: (tmdbId: number) => void;
  onRecordPicker: (memberId: string) => void;
  onSkipPick: () => void;
  onDone: () => void;
  onPickFilm: () => void;
}) {
  return (
    <>
      {actionError !== null ? (
        <Text style={[styles.banner, styles.error]}>{actionError}</Text>
      ) : null}
      {step === "who" ? (
        <WhoStep
          night={night}
          members={members}
          order={order}
          attendeeIds={attendeeIds}
          busy={busy}
          future={future}
          onToggle={onToggle}
          onNext={onAdvance}
        />
      ) : step === "pick" ? (
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
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
});
