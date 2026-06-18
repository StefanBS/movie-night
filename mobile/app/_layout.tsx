import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { colors } from "../theme";

export default function RootLayout() {
  // Brand faces for the Spotlight theme. The keys must match the fontFamily
  // names in theme/typography.ts exactly — RN has no font fallback stack.
  const [loaded] = useFonts({
    InstrumentSerif: require("../assets/fonts/InstrumentSerif-Regular.ttf"),
    "InstrumentSerif-Italic": require("../assets/fonts/InstrumentSerif-Italic.ttf"),
    HankenGrotesk: require("../assets/fonts/HankenGrotesk-Regular.ttf"),
    "HankenGrotesk-Medium": require("../assets/fonts/HankenGrotesk-Medium.ttf"),
    "HankenGrotesk-SemiBold": require("../assets/fonts/HankenGrotesk-SemiBold.ttf"),
    "HankenGrotesk-Bold": require("../assets/fonts/HankenGrotesk-Bold.ttf"),
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    "SpaceMono-Bold": require("../assets/fonts/SpaceMono-Bold.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface.dark },
          headerTintColor: colors.text.primary,
          contentStyle: { backgroundColor: colors.surface.page },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="manage" options={{ title: "Manage members" }} />
        {/* These render their own TopBar (kind="title"); hide the Stack header. */}
        <Stack.Screen name="night/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="night/new" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="rotation" options={{ headerShown: false }} />
        <Stack.Screen name="member/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="member/new" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
