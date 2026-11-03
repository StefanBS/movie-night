import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ellipsis } from "lucide-react-native";

import { IconButton, TopBar } from "../";
import { useHardwareBack } from "../useHardwareBack";
import { useSession } from "../useSession";
import { PickStep } from "./PickStep";
import { NightView } from "./NightView";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import type { Member } from "../../lib/members";
import { createNightEditor, type EditorStep } from "../../lib/nightEditor";
import type { Night } from "../../lib/nights";
import { createThemedStyles, space, textPresets, useColors } from "../../theme";

// ExistingNightEditor renders the editor module (lib/nightEditor) for a saved
// Night: the Pick step or the Night view it rests on. Mount with
// key={night.id} when the loaded night changes. A route that refreshes the
// Night passes loadStartedAt with it, and the editor takes the refreshed copy
// without remounting, so its step survives. `back` names the screen the
// Night view returns to ("Tonight", "Watched", …). `groupName` titles the
// Night's calendar entry (null: "Movie night").
export function ExistingNightEditor({
  night,
  members,
  groupName,
  loadStartedAt,
  today,
  initialStep,
  back,
  onEdit,
}: {
  night: Night;
  members: Member[];
  groupName: string | null;
  loadStartedAt?: number;
  today: string;
  initialStep?: EditorStep;
  back: { label: string; onPress: () => void };
  onEdit?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [moreOpen, setMoreOpen] = useState(false);
  const [editor, state] = useSession(() =>
    createNightEditor({ baseUrl: API_URL, groupId: GROUP_ID, night, members, initialStep }),
  );
  useEffect(() => {
    if (loadStartedAt !== undefined) {
      editor.refresh(night, members, loadStartedAt);
    }
  }, [editor, night, members, loadStartedAt]);
  const current = state.night;

  const picking = state.step === "pick";
  // The Pick step returns to the Night view, on Android's back button too.
  useHardwareBack(picking ? editor.toNight : null);

  return (
    <View style={styles.screen}>
      {picking ? (
        <TopBar kind="title" title="The pick" back={{ label: "Night", onPress: editor.toNight }} />
      ) : (
        <TopBar
          kind="title"
          title=""
          back={back}
          right={
            <IconButton
              icon={<Ellipsis size={20} color={colors.text.secondary} />}
              accessibilityLabel="More"
              filled
              onPress={() => setMoreOpen(true)}
            />
          }
        />
      )}
      {state.actionError !== null ? (
        <Text style={styles.banner}>{state.actionError}</Text>
      ) : null}
      {picking ? (
        <PickStep
          night={current}
          members={state.members}
          today={today}
          busy={state.busy}
          results={state.results}
          resultsFor={state.resultsFor}
          searching={state.searching}
          searchError={state.searchError}
          groupNights={state.groupNights}
          onSearch={editor.search}
          onAttach={editor.attach}
          onChangePicker={editor.changePicker}
          onSkip={editor.toNight}
        />
      ) : (
        <NightView
          night={current}
          members={state.members}
          groupName={groupName}
          today={today}
          moreOpen={moreOpen}
          onCloseMore={() => setMoreOpen(false)}
          onPickFilm={editor.pickFilm}
          onClearFilm={editor.clearFilm}
          onEdit={onEdit}
        />
      )}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  banner: {
    ...textPresets.body,
    color: colors.text.danger,
    paddingVertical: space[2],
    paddingHorizontal: space[5],
    textAlign: "center",
  },
}));
