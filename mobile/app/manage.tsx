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

import { resolveApiBaseUrl } from "../lib/api";
import {
  addMember,
  deactivateMember,
  fetchMembers,
  promoteMember,
  reactivateMember,
  type Member,
} from "../lib/members";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

type Action = {
  label: string;
  run: (userId: string) => Promise<Member>;
};

// actionsFor returns the churn actions valid for a member's current state.
function actionsFor(m: Member): Action[] {
  if (m.status === "inactive") {
    return [{ label: "Reactivate", run: (id) => reactivateMember(API_URL, GROUP_ID, id) }];
  }
  if (m.role === "guest") {
    return [
      { label: "Promote", run: (id) => promoteMember(API_URL, GROUP_ID, id) },
      { label: "Deactivate", run: (id) => deactivateMember(API_URL, GROUP_ID, id) },
    ];
  }
  return [{ label: "Deactivate", run: (id) => deactivateMember(API_URL, GROUP_ID, id) }];
}

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
        setError(e instanceof Error ? e.message : "failed to load members");
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
      await addMember(API_URL, GROUP_ID, trimmed);
      setName("");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "failed to add member");
    } finally {
      setBusy(null);
    }
  }, [name, busy, load]);

  const onAction = useCallback(
    async (member: Member, action: Action) => {
      if (busy !== null) {
        return;
      }
      setBusy(member.id);
      setActionError(null);
      try {
        await action.run(member.id);
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : `failed to ${action.label.toLowerCase()}`);
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
                  actionsFor(item).map((a) => (
                    <Pressable
                      key={a.label}
                      onPress={() => onAction(item, a)}
                      disabled={busy !== null}
                      style={({ pressed }) => [styles.action, pressed && styles.rowPressed]}
                    >
                      <Text style={styles.actionText}>{a.label}</Text>
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
