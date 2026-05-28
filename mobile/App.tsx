import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

type Member = {
  id: string;
  name: string;
  role: "core" | "guest";
};

export default function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/groups/${GROUP_ID}/members`);
        if (!res.ok) {
          throw new Error(`request failed: ${res.status}`);
        }
        const data: Member[] = await res.json();
        if (!cancelled) {
          setMembers(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "failed to load roster");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Roster</Text>
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" />
      ) : error ? (
        <Text style={[styles.center, styles.error]}>Couldn't load roster: {error}</Text>
      ) : members.length === 0 ? (
        <Text style={styles.center}>No members yet.</Text>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.role}>{item.role}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 16 },
  center: { marginTop: 32, textAlign: "center" },
  error: { color: "#b00020" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  name: { fontSize: 18 },
  role: { fontSize: 16, color: "#666" },
});
