import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronRight, Plus } from "lucide-react-native";

import {
  Badge,
  IconButton,
  MemberRow,
  SectionLabel,
  TabScrollView,
  TopBar,
} from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { fetchMembers, type Member } from "../../lib/members";
import { fetchTurn, pickerMeta, type TurnMember } from "../../lib/turn";
import { buildClubSections, clubSummary } from "../../lib/club";
import { colors, space, textPresets } from "../../theme";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

export default function ClubScreen() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [turn, setTurn] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          const [m, t] = await Promise.all([
            fetchMembers(API_URL, GROUP_ID, controller.signal),
            fetchTurn(API_URL, GROUP_ID, controller.signal),
          ]);
          setMembers(m);
          setTurn(t);
          setError(null);
        } catch (e) {
          if (!controller.signal.aborted) {
            setError(errorMessage(e, "failed to load the club"));
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();
      return () => controller.abort();
    }, []),
  );

  const sections = buildClubSections(members, turn);
  const open = (id: string) =>
    router.push({ pathname: "/member/[id]", params: { id } });

  return (
    <View style={styles.screen}>
      <TopBar
        kind="tab"
        title="The Club"
        sub={loading || error !== null ? undefined : clubSummary(members, turn)}
        right={
          <IconButton
            variant="accent"
            accessibilityLabel="Add member"
            onPress={() => router.push("/member/new")}
            icon={<Plus size={20} color={colors.text.onAccent} strokeWidth={2.4} />}
          />
        }
      />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>{`Couldn't load the club: ${error}`}</Text>
      ) : members.length === 0 ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the club yet."}</Text>
        </View>
      ) : (
        <TabScrollView contentContainerStyle={styles.content}>
          <SectionLabel>In rotation</SectionLabel>
          <View>
            {sections.inRotation.map((m, i) => (
              <View
                key={m.id}
                style={i < sections.inRotation.length - 1 ? styles.divider : undefined}
              >
                <MemberRow
                  rank={i + 1}
                  name={m.name}
                  meta={pickerMeta(m)}
                  spotlight={i === 0}
                  onPress={() => open(m.id)}
                  right={
                    i === 0 ? (
                      <Badge label="Next up" />
                    ) : (
                      <ChevronRight size={18} color={colors.text.tertiary} />
                    )
                  }
                />
              </View>
            ))}
          </View>

          {sections.guests.length > 0 ? (
            <>
              <SectionLabel>Guests · not in rotation</SectionLabel>
              <View>
                {sections.guests.map((m, i) => (
                  <View
                    key={m.id}
                    style={i < sections.guests.length - 1 ? styles.divider : undefined}
                  >
                    <MemberRow
                      name={m.name}
                      onPress={() => open(m.id)}
                      right={<Badge label="Guest" tone="neutral" />}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {sections.inactive.length > 0 ? (
            <>
              <SectionLabel>Inactive</SectionLabel>
              <View style={styles.dimmed}>
                {sections.inactive.map((m, i) => (
                  <View
                    key={m.id}
                    style={i < sections.inactive.length - 1 ? styles.divider : undefined}
                  >
                    <MemberRow
                      name={m.name}
                      onPress={() => open(m.id)}
                      right={<ChevronRight size={18} color={colors.text.tertiary} />}
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </TabScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center" },
  content: { paddingHorizontal: space[5] },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.hairline,
  },
  dimmed: { opacity: 0.55 },
  empty: { ...textPresets.body, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.accent.strong, textAlign: "center", paddingHorizontal: space[5] },
});
