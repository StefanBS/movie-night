import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppButton, TabScrollView, TopBar } from "../../../components";
import { colors, space, textPresets } from "../../../theme";

// Placeholder until reminders (#50–#51).
export default function RemindersStubScreen() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="Reminders" back={{ label: "Edit", onPress: () => router.back() }} />
      <TabScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>
          Reminders and nudges are coming in a later release.
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
