import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { ChevronRight } from "lucide-react-native";

import {
  Input,
  SectionLabel,
  SettingsRow,
  TabScrollView,
  TopBar,
} from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { formatMonthYear } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { fetchGroup, renameGroup, type Group } from "../../lib/group";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  space,
  textPresets,
  trackPx,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export default function SettingsScreen() {
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline rename of the group name. `draft` holds the in-progress edit; saving
  // PATCHes and folds the row back to its display state on success.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The group name only changes here (via rename, which updates state directly),
  // so a one-shot fetch on mount is enough — no focus refetch needed.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setGroup(await fetchGroup(API_URL, GROUP_ID, controller.signal));
        setError(null);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load settings"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const startEdit = () => {
    if (group === null) {
      return;
    }
    setDraft(group.name);
    setSaveError(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (trimmed === "" || saving) {
      return;
    }
    if (group !== null && trimmed === group.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await renameGroup(API_URL, GROUP_ID, trimmed);
      setGroup(updated);
      setEditing(false);
      setSaveError(null);
    } catch (e) {
      setSaveError(errorMessage(e, "couldn't rename the group"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar kind="tab" title="Settings" />
      <TabScrollView contentContainerStyle={styles.content}>
        <View style={styles.ruleCard}>
          <Text style={styles.ruleKicker} allowFontScaling={false}>
            THE HOUSE RULE
          </Text>
          <Text style={styles.ruleText}>
            One pick a night. No voting, no vetoing.
          </Text>
        </View>

        <SectionLabel>Group</SectionLabel>
        {loading ? (
          <View style={styles.card}>
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accent.base} />
            </View>
          </View>
        ) : error !== null ? (
          <View style={styles.card}>
            <View style={styles.messageRow}>
              <Text style={styles.errorText}>{`Couldn't load: ${error}`}</Text>
            </View>
          </View>
        ) : group !== null && editing ? (
          <View style={styles.editGroup}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="Group name"
              autoFocus
              onSubmitEditing={saveEdit}
              addonLabel="Save"
              onAddonPress={saveEdit}
            />
            {saveError !== null ? (
              <Text style={styles.errorText}>{saveError}</Text>
            ) : null}
          </View>
        ) : group !== null ? (
          <View style={styles.card}>
            <SettingsRow
              label={group.name}
              value={`Since ${formatMonthYear(group.createdOn)}`}
              onPress={startEdit}
            />
          </View>
        ) : null}

        <SectionLabel>Notifications</SectionLabel>
        <View style={styles.card}>
          <SettingsRow
            label="Reminders & nudges"
            disabled
            right={<ChevronRight size={18} color={colors.text.tertiary} />}
          />
        </View>

        <SectionLabel>Danger zone</SectionLabel>
        <View style={styles.card}>
          <View style={styles.divider}>
            <SettingsRow label="Reset history" danger disabled />
          </View>
          <SettingsRow label="Leave group" danger disabled />
        </View>
      </TabScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { paddingHorizontal: space[5] },
  ruleCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    padding: space[5],
    marginTop: space[6],
    marginBottom: space[4],
    gap: space[2],
  },
  ruleKicker: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
  },
  ruleText: { ...textPresets.screenTitle, color: colors.text.primary },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  loadingRow: { paddingVertical: space[5], alignItems: "center" },
  messageRow: { paddingVertical: space[3], paddingHorizontal: space[4] },
  errorText: { ...textPresets.body, color: colors.text.danger },
  editGroup: { gap: space[2] },
});
