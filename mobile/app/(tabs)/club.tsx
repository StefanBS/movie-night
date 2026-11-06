import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Plus } from "lucide-react-native";

import {
  Badge,
  IconButton,
  MemberRow,
  SectionLabel,
  TabScrollView,
  TopBar,
} from "../../components";
import { useLoad } from "../../components/useLoad";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { fetchMembers, type Member } from "../../lib/members";
import { fetchTurn, pickerMeta, type TurnMember } from "../../lib/turn";
import { buildClubSections, clubSummary } from "../../lib/club";
import { createThemedStyles, space, textPresets, useColors } from "../../theme";

export default function ClubScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const {
    data: { members, turn },
    loading,
    error,
  } = useLoad(
    async (signal) => {
      const [members, turn] = await Promise.all([
        fetchMembers(API_URL, GROUP_ID, signal),
        fetchTurn(API_URL, GROUP_ID, signal),
      ]);
      return { members, turn };
    },
    { members: [] as Member[], turn: [] as TurnMember[] },
    "failed to load the club",
  );

  const sections = buildClubSections(members, turn);
  const open = (id: string) =>
    router.push({ pathname: "/member/[id]", params: { id } });

  return (
    <View style={styles.screen}>
      <TopBar
        kind="tab"
        title="Club"
        sub={loading || error !== null ? undefined : clubSummary(members, turn)}
        right={
          <IconButton
            filled
            accessibilityLabel="Add member"
            onPress={() => router.push("/member/new")}
            icon={<Plus size={20} color={colors.text.secondary} strokeWidth={2} />}
          />
        }
      />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={colors.text.secondary} />
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
              <MemberRow
                key={m.id}
                rank={i + 1}
                name={m.name}
                meta={pickerMeta(m)}
                highlighted={i === 0}
                divider={i < sections.inRotation.length - 1}
                onPress={() => open(m.id)}
                right={
                  i === 0 ? (
                    <Badge label="Next up" tone="solid" />
                  ) : (
                    <ChevronRight size={18} color={colors.text.tertiary} />
                  )
                }
              />
            ))}
          </View>

          {sections.guests.length > 0 ? (
            <>
              <SectionLabel>Guests · not in rotation</SectionLabel>
              <View>
                {sections.guests.map((m, i) => (
                  <MemberRow
                    key={m.id}
                    name={m.name}
                    divider={i < sections.guests.length - 1}
                    onPress={() => open(m.id)}
                    right={<Badge label="Guest" tone="neutral" />}
                  />
                ))}
              </View>
            </>
          ) : null}

          {sections.inactive.length > 0 ? (
            <>
              <SectionLabel>Inactive</SectionLabel>
              <View>
                {sections.inactive.map((m, i) => (
                  <MemberRow
                    key={m.id}
                    name={m.name}
                    muted
                    divider={i < sections.inactive.length - 1}
                    onPress={() => open(m.id)}
                    right={<ChevronRight size={18} color={colors.text.tertiary} />}
                  />
                ))}
              </View>
            </>
          ) : null}
        </TabScrollView>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center" },
  content: { paddingHorizontal: space[5] },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  empty: { ...textPresets.body, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.text.danger, textAlign: "center", paddingHorizontal: space[5] },
}));
