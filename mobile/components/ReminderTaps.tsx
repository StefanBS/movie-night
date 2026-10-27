import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

import { API_URL } from "../apiUrl";
import { GROUP_ID } from "../lib/api";
import { getNightOrNull } from "../lib/nights";
import { reminderNightId } from "../lib/reminderTap";

// ReminderTaps opens the Night a tapped reminder is about — also when the tap
// launched the app — or Home when that Night has since been cancelled.
// Native only: push has no web implementation.
export function ReminderTaps() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (response == null || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      return;
    }
    const nightId = reminderNightId(response.notification.request.content.data);
    if (nightId === null) {
      return;
    }
    // Handle each tap once, even if this remounts.
    void Notifications.clearLastNotificationResponseAsync();
    (async () => {
      const night = await getNightOrNull(API_URL, GROUP_ID, nightId).catch(() => undefined);
      if (night === null) {
        router.replace("/");
      } else {
        // On a network error, open the Night anyway; its screen shows the error.
        router.push(`/night/${nightId}`);
      }
    })();
  }, [response, router]);

  return null;
}
