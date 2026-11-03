import { Platform } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { IdentityProvider } from "../components/IdentityProvider";
import { ReminderTaps } from "../components/ReminderTaps";
import { ToastProvider } from "../components/Toast";
import { showRemindersInForeground } from "../pushDevice";
import { useColors } from "../theme";

showRemindersInForeground();

export default function RootLayout() {
  const colors = useColors();
  // Brand faces for the Spotlight theme. The keys must match the fontFamily
  // names in theme/typography.ts exactly — RN has no font fallback stack.
  const [loaded] = useFonts({
    SchibstedGrotesk: require("../assets/fonts/SchibstedGrotesk-Regular.ttf"),
    "SchibstedGrotesk-Medium": require("../assets/fonts/SchibstedGrotesk-Medium.ttf"),
    "SchibstedGrotesk-SemiBold": require("../assets/fonts/SchibstedGrotesk-SemiBold.ttf"),
    "SchibstedGrotesk-Bold": require("../assets/fonts/SchibstedGrotesk-Bold.ttf"),
    "SchibstedGrotesk-ExtraBold": require("../assets/fonts/SchibstedGrotesk-ExtraBold.ttf"),
    Newsreader: require("../assets/fonts/Newsreader-Regular.ttf"),
    "Newsreader-Medium": require("../assets/fonts/Newsreader-Medium.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <ToastProvider>
        <IdentityProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.surface.page },
              headerTintColor: colors.text.primary,
              contentStyle: { backgroundColor: colors.surface.page },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* These render their own TopBar (kind="title"); hide the Stack header. */}
            <Stack.Screen name="night/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="night/edit/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="night/new" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="rotation" options={{ headerShown: false }} />
            <Stack.Screen name="member/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="member/new" options={{ headerShown: false }} />
          </Stack>
          {Platform.OS !== "web" ? <ReminderTaps /> : null}
        </IdentityProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
