import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";

import { AppButton, Avatar, Badge, SectionLabel, Stat, TopBar } from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import {
  fetchMembers,
  memberActions,
  transitionMember,
  type Member,
  type MemberAction,
} from "../../lib/members";
import { fetchTurn } from "../../lib/turn";
import { memberProfile, type MemberProfile } from "../../lib/club";
import { formatMonthYear, formatShortDate } from "../../lib/date";
import {
  borderWidth,
  colors,
  radius,
  space,
  textPresets,
} from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const ACTION_LABEL: Record<MemberAction, string> = {
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  promote: "Promote to core",
};

function StatsCard({ profile }: { profile: MemberProfile }) {
  const t = profile.turn;
  const picks = t ? String(t.servedCount) : "—";
  const last = t && t.lastPickedOn ? formatShortDate(t.lastPickedOn) : "—";
  const inLine = profile.rank != null ? `#${profile.rank}` : "—";
  return (
    <View style={styles.stats}>
      <View style={styles.statCell}>
        <Stat value={picks} label="Picks" />
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statCell}>
        <Stat value={last} label="Last pick" />
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statCell}>
        <Stat value={inLine} label="In line" accent />
      </View>
    </View>
  );
}

export default function MemberProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const [m, t] = await Promise.all([
            fetchMembers(API_URL, GROUP_ID, controller.signal),
            fetchTurn(API_URL, GROUP_ID, controller.signal),
          ]);
          setProfile(memberProfile(m, t, id));
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load the member"));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
      return () => controller.abort();
    }, [id]),
  );

  const act = async (member: Member, action: MemberAction) => {
    setBusy(true);
    try {
      await transitionMember(API_URL, GROUP_ID, member.id, action);
      router.back();
    } catch (e) {
      setError(errorMessage(e, "couldn't update the member"));
      setBusy(false);
    }
  };

  const back = { label: "The Club", onPress: () => router.back() };
  const member = profile?.member;

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="" back={back} />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>{`Couldn't load the member: ${error}`}</Text>
      ) : member === undefined || profile === null ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"That member isn't in the club."}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Avatar name={member.name} size={76} />
              <Text style={styles.name}>{member.name}</Text>
              <View style={styles.subRow}>
                <Badge label={member.role === "core" ? "Core" : "Guest"} tone="neutral" />
                <Text style={styles.since}>{`since ${formatMonthYear(member.joinedOn)}`}</Text>
              </View>
            </View>

            <StatsCard profile={profile} />

            <SectionLabel>{`${member.name.split(" ")[0]}'s picks`}</SectionLabel>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                {"Their picks will appear here once night history lands."}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {memberActions(member).map((action) => (
              <AppButton
                key={action}
                title={ACTION_LABEL[action]}
                variant={action === "deactivate" ? "secondary" : "primary"}
                fullWidth
                disabled={busy}
                onPress={() => act(member, action)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center" },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  content: { paddingHorizontal: space[5], paddingBottom: space[10] },
  header: { alignItems: "center", marginTop: space[2] },
  name: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[3] },
  subRow: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[2] },
  since: { ...textPresets.barMeta, color: colors.text.tertiary },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.lg,
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    marginTop: space[5],
  },
  statCell: { flex: 1, alignItems: "center" },
  statDivider: { width: borderWidth.hairline, alignSelf: "stretch", backgroundColor: colors.border.hairline },
  placeholder: {
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.md,
    padding: space[4],
  },
  placeholderText: { ...textPresets.body, color: colors.text.tertiary },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[8],
    gap: space[2],
  },
  empty: { ...textPresets.body, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.accent.strong, textAlign: "center", paddingHorizontal: space[5] },
});
