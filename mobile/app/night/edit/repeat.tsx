import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton, TabScrollView, TopBar } from "../../../components";
import { colors, space, textPresets } from "../../../theme";

// Placeholder until recurrence (#48–#49).
export default function RepeatStubScreen() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="Repeat" back={{ label: "Edit", onPress: () => router.back() }} />
      <TabScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>
          Recurrence is coming in a later release. For now, each night is planned one at a time.
        </Text>
        <AppButton title="Done" fullWidth onPress={() => router.back()} />
      </TabScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { paddingHorizontal: space[5], paddingTop: space[6], gap: space[5] },
  body: { ...textPresets.body, color: colors.text.secondary },
});
