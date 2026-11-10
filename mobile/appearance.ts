import { Appearance, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { colorSchemeOverride, parseThemePreference, type ThemePreference } from "./lib/appearance";

// appearance keeps the Appearance setting (lib/appearance) across launches and
// applies it. Like identityToken.ts it lives outside lib/ because it needs
// native modules. The preference isn't a secret; expo-secure-store is just the
// key-value store the app already ships, and its synchronous API lets the
// root layout apply the choice before the first frame, so there's no flash of
// the wrong theme. It has no web implementation, so web uses localStorage.

const KEY = "theme-preference";

function read(): string | null {
  if (Platform.OS === "web") {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  }
  try {
    return SecureStore.getItem(KEY);
  } catch {
    // An unreadable store falls back to following the phone.
    return null;
  }
}

/** The stored preference ("system" when nothing is stored). */
export function loadThemePreference(): ThemePreference {
  return parseThemePreference(read());
}

/** Points the app's colour scheme at `pref`. */
export function applyThemePreference(pref: ThemePreference): void {
  Appearance.setColorScheme(colorSchemeOverride(pref));
}

/** Applies `pref` now and stores it for the next launch. */
export function saveThemePreference(pref: ThemePreference): void {
  applyThemePreference(pref);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(KEY, pref);
    return;
  }
  SecureStore.setItem(KEY, pref);
}
