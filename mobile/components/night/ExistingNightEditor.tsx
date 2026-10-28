import { useEffect } from "react";
import { View, StyleSheet, Text } from "react-native";

import { TopBar } from "../";
import { useSession } from "../useSession";
import { PickStep } from "./PickStep";
import { NightView } from "./NightView";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import type { Member } from "../../lib/members";
import { createNightEditor, type EditorStep } from "../../lib/nightEditor";
import type { Night } from "../../lib/nights";
import { colors, space, textPresets } from "../../theme";

// ExistingNightEditor renders the editor module (lib/nightEditor) for a saved
// Night: the Pick step or the Night view it rests on. Mount with
// key={night.id} when the loaded night changes. A route that refreshes the
// Night passes loadStartedAt with it, and the editor takes the refreshed copy
// without remounting, so its step survives.
export function ExistingNightEditor({
  night,
  members,
  loadStartedAt,
  today,
  initialStep,
  onDone,
  onCancel,
  onEdit,
  cancelLabel = "Cancel",
  showBackOnNight = false,
}: {
  night: Night;
  members: Member[];
  loadStartedAt?: number;
  today: string;
  initialStep?: EditorStep;
  onDone: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  cancelLabel?: string;
  showBackOnNight?: boolean;
}) {
  const [editor, state] = useSession(() =>
    createNightEditor({ baseUrl: API_URL, groupId: GROUP_ID, night, members, initialStep }),
  );
  useEffect(() => {
    if (loadStartedAt !== undefined) {
      editor.refresh(night, members, loadStartedAt);
    }
  }, [editor, night, members, loadStartedAt]);
  const current = state.night;

  // The Night view is the editor's resting state, so it shows a back target
  // only when the caller asked for one.
  const back =
    state.step === "pick"
      ? { label: "Night", onPress: editor.toNight }
      : showBackOnNight
        ? { label: cancelLabel, onPress: onCancel }
        : undefined;

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title={state.step === "pick" ? "The pick" : "Night"} back={back} />
      {state.actionError !== null ? (
        <Text style={styles.banner}>{state.actionError}</Text>
      ) : null}
      {state.step === "pick" ? (
        <PickStep
          night={current}
          members={state.members}
          today={today}
          busy={state.busy}
          results={state.results}
          searching={state.searching}
          searchError={state.searchError}
          onSearch={editor.search}
          onAttach={editor.attach}
          onChangePicker={editor.changePicker}
          onSkip={editor.toNight}
        />
      ) : (
        <NightView
          night={current}
          members={state.members}
          today={today}
          onDone={onDone}
          onPickFilm={editor.pickFilm}
          onClearFilm={editor.clearFilm}
          onEdit={onEdit}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  banner: {
    ...textPresets.body,
    color: colors.text.danger,
    paddingVertical: space[2],
    paddingHorizontal: space[5],
    textAlign: "center",
  },
});
