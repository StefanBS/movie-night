import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppButton, Avatar, Badge, Poster, SectionLabel, Stat, TopBar } from "../../components";
import { useLoad } from "../../components/useLoad";
import { API_URL } from "../../apiUrl";
import { firstName } from "../../lib/avatar";
import { GROUP_ID } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import {
  fetchMembers,
  memberActions,
  transitionMember,
  type Member,
  type MemberAction,
} from "../../lib/members";
import { listNights, type Night } from "../../lib/nights";
import { fetchTurn } from "../../lib/turn";
import {
  memberPicks,
  memberProfile,
  memberSince,
  noPicksLine,
  ordinal,
  type MemberProfile,
} from "../../lib/club";
import { formatShortDate } from "../../lib/date";
import {
  borderWidth,
  createThemedStyles,
  fontFamily,
  pressedOpacity,
  space,
  tabular,
  textPresets,
  trackPx,
  useColors,
} from "../../theme";

const ACTION_LABEL: Record<MemberAction, (first: string) => string> = {
  deactivate: (first) => `Deactivate ${first}`,
  reactivate: (first) => `Reactivate ${first}`,
  promote: () => "Promote to core",
};

// Stats sits on a hairline, not in a card. The place in line is plain text:
// the accent stays with the picker.
function Stats({ profile }: { profile: MemberProfile }) {
  const styles = useStyles();
  const t = profile.turn;
  return (
    <View style={styles.stats}>
      <Stat value={t ? t.servedCount : "—"} label={t?.servedCount === 1 ? "Pick" : "Picks"} />
      <Stat value={t?.lastPickedOn ? formatShortDate(t.lastPickedOn) : "—"} label="Last pick" />
      <Stat value={profile.rank !== null ? ordinal(profile.rank) : "—"} label="In line" />
    </View>
  );
}

// PickRow is one Night the member picked: the film, its year and how many
// watched, and the date.
function PickRow({ night, last, onPress }: { night: Night; last: boolean; onPress: () => void }) {
  const styles = useStyles();
  const meta = [night.movie?.releaseYear, `${night.attendees.length} watched`].filter((x) => x != null).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.pick, !last && styles.divider, pressed && styles.pressed]}
    >
      <Poster uri={night.movie?.posterUrl} title={night.movie?.title} w={40} h={60} />
      <View style={styles.pickText}>
        <Text style={styles.pickTitle} numberOfLines={1}>
          {night.movie ? night.movie.title : "Untitled night"}
        </Text>
        <Text style={styles.pickMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.pickDate}>{formatShortDate(night.scheduledFor)}</Text>
    </Pressable>
  );
}

export default function MemberProfileScreen() {
  const colors = useColors();
  const styles = useStyles();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // The picks are the page's content, so a failed nights load fails the
  // screen like the roster does.
  const {
    data: { profile, picks },
    loading,
    error,
    setError,
  } = useLoad(
    async (signal) => {
      const [m, t, n] = await Promise.all([
        fetchMembers(API_URL, GROUP_ID, signal),
        fetchTurn(API_URL, GROUP_ID, signal),
        listNights(API_URL, GROUP_ID, signal),
      ]);
      return { profile: memberProfile(m, t, id), picks: memberPicks(n, id) };
    },
    { profile: null as MemberProfile | null, picks: [] as Night[] },
    "failed to load the member",
    { key: id },
  );
  const [busy, setBusy] = useState(false);

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

  const back = { label: "Club", onPress: () => router.back() };
  const member = profile?.member;

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="" back={back} />
      {loading ? (
        <ActivityIndicator style={styles.center} size="large" color={colors.text.secondary} />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>{`Couldn't load the member: ${error}`}</Text>
      ) : member === undefined || profile === null ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"That member isn't in the club."}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Avatar name={member.name} size={64} />
            <View style={styles.headerText}>
              <Text style={styles.name} numberOfLines={1}>
                {firstName(member.name)}
              </Text>
              <Text style={styles.since}>{memberSince(member)}</Text>
            </View>
          </View>
          {profile.rank === 1 ? (
            <View style={styles.nextUp}>
              <Badge label="Next up" tone="solid" />
            </View>
          ) : null}

          <Stats profile={profile} />

          <View style={styles.picksLabel}>
            <SectionLabel>{`${firstName(member.name)}'s picks`}</SectionLabel>
          </View>
          {picks.length === 0 ? (
            <Text style={styles.noPicks}>{noPicksLine(member.name, profile.rank)}</Text>
          ) : (
            picks.map((n, i) => (
              <PickRow
                key={n.id}
                night={n}
                last={i === picks.length - 1}
                onPress={() =>
                  router.push({ pathname: "/night/[id]", params: { id: n.id, from: firstName(member.name) } })
                }
              />
            ))
          )}

          <View style={styles.actions}>
            {memberActions(member).map((action) => (
              <AppButton
                key={action}
                title={ACTION_LABEL[action](firstName(member.name))}
                variant={action === "deactivate" ? "danger" : "secondary"}
                size="sm"
                disabled={busy}
                onPress={() => act(member, action)}
              />
            ))}
            {member.status === "active" && member.role === "core" ? (
              <Text style={styles.note}>Leaves the rotation. Their picks stay in Watched.</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const NAME = 40;

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, textAlignVertical: "center" },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  content: { paddingHorizontal: space[5], paddingBottom: space[10] },
  header: { flexDirection: "row", alignItems: "center", gap: space[4], marginTop: 14 },
  headerText: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fontFamily.display,
    fontSize: NAME,
    lineHeight: Math.round(NAME * 1.05),
    letterSpacing: trackPx(NAME, "display"),
    color: colors.text.primary,
  },
  since: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[2] },
  nextUp: { flexDirection: "row", marginTop: 18 },
  stats: {
    flexDirection: "row",
    gap: 30,
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
  },
  picksLabel: { marginTop: space[1] },
  noPicks: { ...textPresets.body, color: colors.text.secondary, paddingTop: space[1] },
  pick: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.border.hairline },
  pressed: { opacity: pressedOpacity },
  pickText: { flex: 1, minWidth: 0 },
  pickTitle: { fontFamily: fontFamily.serifMedium, fontSize: 19, lineHeight: 22, color: colors.text.primary },
  pickMeta: { ...textPresets.barMeta, ...tabular, color: colors.text.tertiary, marginTop: 2 },
  pickDate: { ...textPresets.barMeta, ...tabular, color: colors.text.tertiary },
  actions: {
    marginTop: 36,
    paddingTop: space[4],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
    alignItems: "flex-start",
    gap: space[2],
  },
  note: { ...textPresets.barMeta, lineHeight: Math.round(13 * 1.45), color: colors.text.tertiary, marginTop: 2 },
  empty: { ...textPresets.body, color: colors.text.secondary },
  error: { ...textPresets.body, color: colors.text.danger, textAlign: "center", paddingHorizontal: space[5] },
}));
