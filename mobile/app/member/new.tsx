import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Check } from "lucide-react-native";

import { AppButton, Input, SectionLabel, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { joinMember } from "../../lib/members";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  space,
  textPresets,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

type Role = "core" | "guest";

const ROLES: { id: Role; label: string; note: string }[] = [
  { id: "core", label: "Core", note: "Enters the pick rotation" },
  { id: "guest", label: "Guest", note: "Watches, never picks" },
];

function RoleCard({
  label,
  note,
  selected,
  onPress,
}: {
  label: string;
  note: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.card, selected ? styles.cardOn : styles.cardOff]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardLabel}>{label}</Text>
        {selected ? <Check size={17} color={colors.accent.strong} strokeWidth={2.4} /> : null}
      </View>
      <Text style={styles.cardNote}>{note}</Text>
    </Pressable>
  );
}

export default function AddMemberScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("core");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === "" || busy) {
      return;
    }
    setBusy(true);
    try {
      await joinMember(API_URL, GROUP_ID, trimmed, role);
      router.back();
    } catch (e) {
      setError(errorMessage(e, "couldn't add the member"));
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="Add member"
        back={{ label: "The Club", onPress: () => router.back() }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Their name</SectionLabel>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="e.g. Alex Rivera"
          autoFocus
          onSubmitEditing={submit}
        />

        <SectionLabel>Join as</SectionLabel>
        <View style={styles.cards}>
          {ROLES.map((r) => (
            <RoleCard
              key={r.id}
              label={r.label}
              note={r.note}
              selected={role === r.id}
              onPress={() => setRole(r.id)}
            />
          ))}
        </View>

        <Text style={styles.helper}>
          {"New core members start with zero picks, so they'll come up first — that's the rotation keeping things fair."}
        </Text>

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          title="Add to the club"
          fullWidth
          disabled={name.trim() === "" || busy}
          onPress={submit}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { paddingHorizontal: space[5], paddingBottom: space[10] },
  cards: { flexDirection: "row", gap: space[3] },
  card: { flex: 1, borderRadius: radius.md, padding: space[4] },
  cardOff: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  cardOn: {
    backgroundColor: colors.surface.spotlight,
    borderWidth: 1.5,
    borderColor: colors.accent.base,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { ...textPresets.rowName, color: colors.text.primary },
  cardNote: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.secondary,
    marginTop: space[2],
  },
  helper: { ...textPresets.body, color: colors.text.tertiary, marginTop: space[5] },
  error: { ...textPresets.body, color: colors.accent.strong, marginTop: space[4] },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[8],
  },
});
