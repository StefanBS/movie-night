import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import type { PushDevice } from "./lib/identity";

// pushDevice is the device's side of reminders (ADR-0010): notification
// permission, the Expo push token and the time zone. Like identityToken.ts it
// lives outside lib/ because it needs native modules; lib/identity drives it.
// Push has no web implementation, so web reports "unavailable".

// REMINDERS_CHANNEL matches the plugin's defaultChannel in app.json, so pushes
// that name no channel land in it too.
const REMINDERS_CHANNEL = "reminders";

export const pushDevice: PushDevice = {
  async access() {
    if (Platform.OS === "web") {
      return "unavailable";
    }
    // Android 13 shows no permission prompt until a channel exists.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL, {
        name: "Reminders",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return "granted";
    }
    // Ask only while the OS has never been asked; once refused, the switch
    // lives in system settings.
    if (current.status !== Notifications.PermissionStatus.UNDETERMINED) {
      return "denied";
    }
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted ? "granted" : "denied";
  },

  async pushToken() {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  },

  timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  },
};

// showRemindersInForeground makes a reminder that arrives while the app is open
// show as a normal banner, as it would with the app closed. Without a handler,
// expo-notifications shows nothing in the foreground.
export function showRemindersInForeground() {
  if (Platform.OS === "web") {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
