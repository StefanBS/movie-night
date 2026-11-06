import { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Avatar,
  Input,
  SectionLabel,
  SettingsRow,
  Toggle,
  TopBar,
} from "../components";
import { useGroup } from "../components/GroupProvider";
import { useIdentity } from "../components/IdentityProvider";
import { API_URL } from "../apiUrl";
import { GROUP_ID } from "../lib/api";
import { formatMonthYear } from "../lib/date";
import { errorMessage } from "../lib/errors";
import { renameGroup } from "../lib/group";
import { borderWidth, createThemedStyles, fontFamily, radius, space, textPresets, useColors } from "../theme";

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const identity = useIdentity();
  const me = identity.state.identity;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // A rename hands its reply to GroupProvider, so every screen on this phone
  // shows the new name without refetching it (other phones pick it up when
  // they return to the foreground). Until it loads,
  // the row shows a spinner, or the launch load's error (opening Settings
  // retries it).
  const { group, setGroup, error } = useGroup();

  // Inline rename of the group name. `draft` holds the in-progress edit; saving
  // PATCHes and folds the row back to its display state on success.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      <TopBar
        kind="title"
        title="Settings"
        // Settings is pushed from the Tonight gear. A deep link can open it with
        // nothing beneath, so fall back to Tonight rather than a dead back.
        back={{
          label: "Tonight",
          onPress: () => (router.canGoBack() ? router.back() : router.replace("/")),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[10] }]}
      >
        <View style={styles.rule}>
          <Text style={styles.ruleKicker}>The house rule</Text>
          <Text style={styles.ruleText}>One pick a night.</Text>
          <Text style={styles.ruleLine}>No voting, no vetoing.</Text>
          <Text style={styles.ruleNote}>
            {"The app tracks who's picked and proposes whose turn is next, so it's always fair."}
          </Text>
        </View>

        <SectionLabel>Group</SectionLabel>
        {group === null ? (
          <View style={styles.card}>
            {error !== null ? (
              <View style={styles.messageRow}>
                <Text style={styles.errorText}>{`Couldn't load: ${error}`}</Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.text.secondary} />
              </View>
            )}
          </View>
        ) : editing ? (
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
        ) : (
          <View style={styles.card}>
            <SettingsRow
              label={group.name}
              value={`Since ${formatMonthYear(group.createdOn)}`}
              onPress={startEdit}
            />
          </View>
        )}

        <SectionLabel>You</SectionLabel>
        <View style={styles.card}>
          <View style={styles.divider}>
            {/* IdentityProvider only shows Settings once this phone is claimed. */}
            <SettingsRow
              label={me?.name ?? ""}
              sub="This phone belongs to you"
              right={me ? <Avatar name={me.name} size={28} /> : undefined}
            />
          </View>
          <SettingsRow
            label="Not you? Switch"
            right={<ChevronRight size={18} color={colors.text.tertiary} />}
            disabled={identity.state.busy}
            onPress={() => void identity.session.release()}
          />
        </View>
        {identity.state.actionError !== null ? (
          <Text style={styles.errorText}>{identity.state.actionError}</Text>
        ) : null}

        <SectionLabel>Notifications</SectionLabel>
        <View style={styles.card}>
          {identity.state.notifications === "denied" ? (
            // The OS permission is off; only system settings can turn it back on.
            <SettingsRow
              label="Reminders & nudges"
              value="Off in system settings"
              right={<ChevronRight size={18} color={colors.text.tertiary} />}
              onPress={() => void Linking.openSettings()}
            />
          ) : identity.state.notifications === "unavailable" ? (
            <SettingsRow label="Reminders & nudges" value="Not on this device" />
          ) : (
            <SettingsRow
              label="Reminders & nudges"
              right={
                <Toggle
                  label="Reminders & nudges"
                  value={!(identity.state.identity?.remindersMuted ?? false)}
                  disabled={identity.state.busy}
                  onChange={(on) => void identity.session.setRemindersMuted(!on)}
                />
              }
            />
          )}
        </View>

        <SectionLabel>Danger zone</SectionLabel>
        <View style={styles.card}>
          <View style={styles.divider}>
            <SettingsRow label="Reset history" danger disabled />
          </View>
          <SettingsRow label="Leave group" danger disabled />
        </View>
      </ScrollView>
    </View>
  );
}

const RULE = 28; // the house rule's headline

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { paddingHorizontal: space[5] },
  // The house rule sits flush on the page, closed off by a hairline.
  rule: {
    marginTop: 22,
    paddingBottom: 22,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  ruleKicker: { fontFamily: fontFamily.sansSemibold, fontSize: 13, color: colors.text.secondary },
  ruleText: {
    fontFamily: fontFamily.display,
    fontSize: RULE,
    lineHeight: Math.round(RULE * 1.05),
    letterSpacing: RULE * -0.035,
    color: colors.text.primary,
    marginTop: space[2],
  },
  ruleLine: {
    ...textPresets.filmTitle,
    fontSize: 24,
    lineHeight: Math.round(24 * 1.2),
    color: colors.text.primary,
    marginTop: 2,
  },
  ruleNote: { ...textPresets.meta, color: colors.text.secondary, marginTop: 10 },
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
}));
