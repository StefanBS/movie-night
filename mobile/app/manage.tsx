import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";

import { GROUP_ID, resolveApiBaseUrl } from "../lib/api";
import { errorMessage } from "../lib/errors";
import {
  fetchMembers,
  joinMember,
  memberActions,
  transitionMember,
  type Member,
  type MemberAction,
} from "../lib/members";
import { AppButton } from "../components/AppButton";
import {
  borderWidth,
  colors,
  fontFamily,
  pressedOpacity,
  radius,
  space,
  textPresets,
} from "../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

// The button label shown for each churn transition (memberActions decides which
// transitions a member can undergo; this is just their presentation).
const ACTION_LABELS: Record<MemberAction, string> = {
  promote: "Promote",
  deactivate: "Deactivate",
  reactivate: "Reactivate",
};

export default function ManageScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [name, setName] = useState("");
  // The id of the member with an action in flight, or "add" while joining.
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchMembers(API_URL, GROUP_ID, signal);
    setMembers(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        await load(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setError(errorMessage(e, "failed to load members"));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [load]);

  const onAdd = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === "" || busy !== null) {
      return;
    }
    setBusy("add");
    setActionError(null);
    try {
      await joinMember(API_URL, GROUP_ID, trimmed, "core");
      setName("");
      await load();
    } catch (e) {
      setActionError(errorMessage(e, "failed to add member"));
    } finally {
      setBusy(null);
    }
  }, [name, busy, load]);

  const onAction = useCallback(
    async (member: Member, action: MemberAction) => {
      if (busy !== null) {
        return;
      }
      setBusy(member.id);
      setActionError(null);
      try {
        await transitionMember(API_URL, GROUP_ID, member.id, action);
        await load();
      } catch (e) {
        setActionError(errorMessage(e, `failed to ${action}`));
      } finally {
        setBusy(null);
      }
    },
    [busy, load],
  );

  if (loading) {
    return (
      <ActivityIndicator
        style={styles.center}
        size="large"
        color={colors.accent.base}
      />
    );
  }
  if (error !== null) {
    return (
      <Text style={[styles.center, styles.error]}>
        {`Couldn't load members: ${error}`}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="New member name"
          placeholderTextColor={colors.text.tertiary}
          value={name}
          onChangeText={setName}
          editable={busy === null}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
        <AppButton
          title="Add"
          onPress={onAdd}
          disabled={busy !== null || name.trim() === ""}
        />
      </View>
      {actionError !== null && (
        <Text style={[styles.banner, styles.error]}>{actionError}</Text>
      )}
      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => {
          const isBusy = busy === item.id;
          const tag = item.status === "inactive" ? "inactive" : item.role;
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={[styles.name, item.status === "inactive" && styles.inactiveName]}>
                  {item.name}
                </Text>
                <Text style={styles.tag}>{tag}</Text>
              </View>
              <View style={styles.actions}>
                {isBusy ? (
                  <Text style={styles.meta}>Working…</Text>
                ) : (
                  memberActions(item).map((a) => (
                    <Pressable
                      key={a}
                      onPress={() => onAction(item, a)}
                      disabled={busy !== null}
                      style={({ pressed }) => [styles.action, pressed && styles.rowPressed]}
                    >
                      <Text style={styles.actionText}>{ACTION_LABELS[a]}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.page, // the dim room
    paddingHorizontal: space[4],
  },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], textAlign: "center" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[3],
  },
  input: {
    flex: 1,
    ...textPresets.body,
    color: colors.text.primary,
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.strong,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  row: {
    paddingVertical: space[3],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  rowMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { ...textPresets.rowName, color: colors.text.primary },
  inactiveName: { color: colors.text.tertiary },
  tag: { ...textPresets.tag, color: colors.text.secondary },
  actions: { flexDirection: "row", gap: space[4], marginTop: space[2] },
  action: { paddingVertical: space[1] },
  actionText: {
    ...textPresets.meta,
    fontFamily: fontFamily.sansSemibold,
    color: colors.accent.cool, // moonlight secondary action
  },
  rowPressed: { opacity: pressedOpacity },
  meta: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[2] },
});
