import { Alert, Linking, Platform } from "react-native";
// The class-based API needs a calendar object, which on Android only comes from
// reading calendars (READ_CALENDAR). The legacy system-form call needs no
// permission on Android or on iOS 17+, so it stays the one we use.
import * as Calendar from "expo-calendar/legacy";

import { calendarEntry } from "./lib/calendarEntry";
import type { Night } from "./lib/nights";

// addToCalendar opens the OS's own new-event form prefilled with the Night's
// Calendar entry, where the person picks a calendar and can adjust the time.
// Like pushDevice.ts it lives outside lib/ because it needs native modules.
// Resolves "saved" only when the OS reports a save (iOS); Android's form always
// reports done, so there it resolves "unknown".
export async function addToCalendar(night: Night): Promise<"saved" | "unknown" | "failed"> {
  try {
    // iOS before 17 presents the form in-process and needs calendar access.
    if (Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) < 17) {
      const { granted } = await Calendar.requestCalendarPermissionsAsync();
      if (!granted) {
        Alert.alert("Calendar access is off", "Turn it on in Settings to add nights to your calendar.", [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
        return "failed";
      }
    }
    const { title, notes, url, startDate, endDate } = calendarEntry(night);
    const result = await Calendar.createEventInCalendarAsync({ title, notes, url, startDate, endDate });
    return result.action === "saved" ? "saved" : "unknown";
  } catch {
    Alert.alert("Couldn't open your calendar", "Try again in a moment.");
    return "failed";
  }
}
