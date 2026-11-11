import { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Ellipsis } from "lucide-react-native";

import { IconButton, TopBar } from "../";
import { useHardwareBack } from "../useHardwareBack";
import { useSession } from "../useSession";
import { PickStep } from "./PickStep";
import { NightView } from "./NightView";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { createNightEditor, type EditorStep } from "../../lib/nightEditor";
import type { Night } from "../../lib/nights";
import { createThemedStyles, space, textPresets, useColors } from "../../theme";

// ExistingNightEditor renders the editor module (lib/nightEditor) for a saved
// Night: the Pick step or the Night view it rests on. Mount with
// key={night.id} when the loaded night changes. A route that refreshes the
// Night passes loadStartedAt with it, and the editor takes the refreshed copy
// without remounting, so its step survives. `back` names the screen the
// Night view returns to ("Tonight", "Watched", …). `onDone`, for a Night just
// planned, puts a "Done" in the Night view's footer that ends the flow.
// `pick` is the top bar of the Pick step the editor opens on (initialStep
// "pick"), when the screen that opened it should get the Night back: its back
// gets the Night as it now stands. Opened from the Night view, the Pick step
// always reads "‹ Night · The pick".
export function ExistingNightEditor({
  night,
  loadStartedAt,
  today,
  initialStep,
  back,
  pick,
  onEdit,
  onDone,
}: {
  night: Night;
  loadStartedAt?: number;
  today: string;
  initialStep?: EditorStep;
  back: { label: string; onPress: () => void };
  pick?: { title: string; back: { label: string; onPress: (night: Night) => void } };
  onEdit: () => void;
  onDone?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [moreOpen, setMoreOpen] = useState(false);
  const [editor, state] = useSession(() =>
    createNightEditor({ baseUrl: API_URL, groupId: GROUP_ID, night, initialStep }),
  );
  useEffect(() => {
    if (loadStartedAt !== undefined) {
      editor.refresh(night, loadStartedAt);
    }
  }, [editor, night, loadStartedAt]);
  const current = state.night;

  const picking = state.step === "pick";
  // The Pick step returns where its top bar says, on Android's back button too.
  const opener = pick !== undefined && !state.pickFromNight ? pick : null;
  const openerBack = opener?.back.onPress;
  const pickBack = useMemo(
    () => (openerBack === undefined ? editor.toNight : () => openerBack(current)),
    [openerBack, editor, current],
  );
  const pickBar = {
    title: opener?.title ?? "The pick",
    back: { label: opener?.back.label ?? "Night", onPress: pickBack },
  };
  useHardwareBack(picking ? pickBack : null);

  return (
    <View style={styles.screen}>
      {picking ? (
        <TopBar kind="title" title={pickBar.title} back={pickBar.back} />
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
          today={today}
          busy={state.busy}
          results={state.results}
          resultsFor={state.resultsFor}
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
          today={today}
          moreOpen={moreOpen}
          onCloseMore={() => setMoreOpen(false)}
          onPickFilm={editor.pickFilm}
          onClearFilm={editor.clearFilm}
          onEdit={onEdit}
          onDone={onDone}
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
