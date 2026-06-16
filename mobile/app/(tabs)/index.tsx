import { StyleSheet, Text, View } from "react-native";
import { Settings } from "lucide-react-native";
import { useRouter } from "expo-router";

import { IconButton, TopBar } from "../../components";
import { colors, space, textPresets } from "../../theme";

// Seeded group name (shared contract). A real source arrives with later work.
const GROUP_NAME = "Friday Film Club";

export default function TonightScreen() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <TopBar
        kind="home"
        group={GROUP_NAME}
        right={
          <IconButton
            icon={<Settings size={22} color={colors.text.secondary} strokeWidth={2} />}
            onPress={() => router.navigate("/settings")}
            accessibilityLabel="Settings"
            variant="ghost"
          />
        }
      />
      <View style={styles.body}>
        <Text style={styles.placeholder}>
          The whose-turn spotlight arrives in the next update.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  placeholder: { ...textPresets.body, color: colors.text.secondary },
});
