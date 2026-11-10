// The Appearance setting: whether the app follows the phone's light/dark mode
// or keeps to one. The choice is stored per install (appearance.ts at the
// mobile root) and handed to React Native's app-level colour-scheme override,
// so every useColors() / createThemedStyles() caller follows it unchanged.

export type ThemePreference = "system" | "light" | "dark";

/** The Settings rows, in the order they're shown. */
export const THEME_PREFERENCES: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Reads a stored preference. Nothing stored, or a value this build doesn't
 * know, means "system", which is how the app behaved before the setting.
 */
export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/**
 * The value for React Native's Appearance.setColorScheme: "unspecified" drops
 * the override so the app follows the phone again.
 */
export function colorSchemeOverride(pref: ThemePreference): "light" | "dark" | "unspecified" {
  return pref === "system" ? "unspecified" : pref;
}
