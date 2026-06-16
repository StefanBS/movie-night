import { StyleSheet, Text, View } from "react-native";

import { TopBar } from "../../components";
import { colors, space, textPresets } from "../../theme";

export default function ClubScreen() {
  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="The Club" />
      <View style={styles.body}>
        <Text style={styles.placeholder}>Members show up here soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  placeholder: { ...textPresets.body, color: colors.text.secondary },
});
