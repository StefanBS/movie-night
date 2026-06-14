import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Button,
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
      await joinMember(API_URL, GROUP_ID, trimmed);
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
    return <ActivityIndicator style={styles.center} size="large" />;
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
          value={name}
          onChangeText={setName}
          editable={busy === null}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
        <Button title="Add" onPress={onAdd} disabled={busy !== null || name.trim() === ""} />
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
  container: { flex: 1, paddingHorizontal: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  banner: { paddingVertical: 8, textAlign: "center" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#999",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  rowMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { fontSize: 18 },
  inactiveName: { color: "#999" },
  tag: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
  },
  actions: { flexDirection: "row", gap: 16, marginTop: 8 },
  action: { paddingVertical: 4 },
  actionText: { fontSize: 14, fontWeight: "600", color: "#0b66c3" },
  rowPressed: { opacity: 0.6 },
  meta: { fontSize: 14, color: "#666", marginTop: 8 },
});
