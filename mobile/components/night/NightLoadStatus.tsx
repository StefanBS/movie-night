import { ActivityIndicator, Text, View } from "react-native";

import { TopBar } from "../";
import type { NightLoadView } from "../../lib/nightLoad";
import { createThemedStyles, space, textPresets, useColors } from "../../theme";

// NightLoadStatus is what a night route shows while it has no Night on
// screen: a spinner on the first load, the error when it failed, else "not
// found".
export function NightLoadStatus({
  title,
  back,
  view,
  error,
}: {
  title: string;
  back: { label: string; onPress: () => void };
  view: NightLoadView;
  error: string | null;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.screen}>
      <TopBar kind="title" title={title} back={back} />
      {view === "loading" ? (
        <ActivityIndicator style={styles.center} size="large" color={colors.text.secondary} />
      ) : view === "failed" ? (
        <Text style={[styles.center, styles.error]}>{`Couldn't load night: ${error}`}</Text>
      ) : (
        <View style={styles.body}>
          <Text style={styles.muted}>{"Couldn't find that night."}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center", textAlign: "center", paddingHorizontal: space[5] },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  error: { ...textPresets.body, color: colors.text.danger },
  muted: { ...textPresets.body, color: colors.text.secondary },
}));
