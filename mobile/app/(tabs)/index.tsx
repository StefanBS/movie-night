import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { Settings } from "lucide-react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";

import {
  AppButton,
  Avatar,
  IconButton,
  SectionLabel,
  TabScrollView,
  TopBar,
} from "../../components";
import { GROUP_ID, resolveApiBaseUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { fetchTurn, pickerMeta, picksLabel, type TurnMember } from "../../lib/turn";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  radius,
  shadow,
  space,
  textPresets,
} from "../../theme";

// Seeded group name (shared contract). A real source arrives with later work.
const GROUP_NAME = "Friday Film Club";

const API_URL = resolveApiBaseUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
});

const AVATAR = 64; // hero avatar diameter
const HALO = 96; // radial bloom box behind the hero avatar
const HALO_OFFSET = (AVATAR - HALO) / 2; // center the halo on the avatar

// SpotlightHero is the rationed-ember card — the one place ember means "whose
// turn it is". Both glows are react-native-svg RadialGradients: a top wash on
// the card and a circular halo behind the 64px avatar (the "bonfire halo").
function SpotlightHero({ member }: { member: TurnMember }) {
  return (
    <View style={styles.hero}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="heroWash" cx="50%" cy="0%" rx="80%" ry="60%">
            <Stop offset="0" stopColor={colors.accent.base} stopOpacity={0.26} />
            <Stop offset="1" stopColor={colors.accent.base} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroWash)" />
      </Svg>

      <Text style={styles.nextUp} allowFontScaling={false}>
        {"✦ Next up"}
      </Text>

      <View style={styles.avatarWrap}>
        <Svg width={HALO} height={HALO} style={styles.halo} pointerEvents="none">
          <Defs>
            <RadialGradient id="avatarHalo" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.accent.base} stopOpacity={0.45} />
              <Stop offset="1" stopColor={colors.accent.base} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={HALO} height={HALO} fill="url(#avatarHalo)" />
        </Svg>
        <Avatar name={member.name} size={AVATAR} glow />
      </View>

      <Text style={styles.heroName} numberOfLines={1}>
        {member.name}
      </Text>
      <Text style={styles.heroMeta}>{pickerMeta(member)}</Text>
    </View>
  );
}

// OnDeck lists the next members after the picker (turn elements 1–3). Ranks are
// offset by 2 because the picker is rank 1 and lives in the hero above.
function OnDeck({ members }: { members: TurnMember[] }) {
  return (
    <>
      <SectionLabel>On deck</SectionLabel>
      <View>
        {members.map((m, i) => (
          <View
            key={m.id}
            style={[styles.deckRow, i < members.length - 1 && styles.deckDivider]}
          >
            <Text style={styles.deckRank} allowFontScaling={false}>
              {i + 2}
            </Text>
            <Avatar name={m.name} size={32} />
            <Text style={styles.deckName} numberOfLines={1}>
              {m.name}
            </Text>
            <Text style={styles.deckPicks} allowFontScaling={false}>
              {picksLabel(m.servedCount)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

export default function TonightScreen() {
  const router = useRouter();
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setOrder(await fetchTurn(API_URL, GROUP_ID, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load tonight"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const gear = (
    <IconButton
      icon={<Settings size={22} color={colors.text.secondary} strokeWidth={2} />}
      onPress={() => router.navigate("/settings")}
      accessibilityLabel="Settings"
      variant="ghost"
    />
  );

  const picker = order[0] ?? null;
  const onDeck = order.slice(1, 4);
  const firstName = picker ? picker.name.split(" ")[0] : "";

  return (
    <View style={styles.screen}>
      <TopBar kind="home" group={GROUP_NAME} right={gear} />
      {loading ? (
        <ActivityIndicator
          style={styles.center}
          size="large"
          color={colors.accent.base}
        />
      ) : error !== null ? (
        <Text style={[styles.center, styles.error]}>
          {`Couldn't load tonight: ${error}`}
        </Text>
      ) : picker === null ? (
        <View style={styles.body}>
          <Text style={styles.empty}>{"No one's in the rotation yet."}</Text>
        </View>
      ) : (
        <TabScrollView contentContainerStyle={styles.content}>
          <SpotlightHero member={picker} />
          <View style={styles.planRow}>
            <AppButton
              title="Plan a night  →"
              fullWidth
              onPress={() => router.navigate("/night/new")}
            />
          </View>
          <View style={styles.skipRow}>
            <AppButton
              title={`${firstName} can't make it — skip turn`}
              variant="ghost"
              onPress={() => {}}
            />
          </View>
          {onDeck.length > 0 ? <OnDeck members={onDeck} /> : null}
          <View style={styles.rotationRow}>
            <AppButton
              title="See full rotation  →"
              variant="ghost"
              onPress={() => router.navigate("/rotation")}
            />
          </View>
        </TabScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  body: { paddingHorizontal: space[5], paddingTop: space[6] },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  empty: { ...textPresets.body, color: colors.text.secondary, textAlign: "center" },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[4],
  },
  planRow: { marginTop: space[5] },
  skipRow: { marginTop: space[3], marginBottom: space[5] },
  rotationRow: { marginTop: space[5] },
  // The ember spotlight card — surface.dark + the bonfire halo shadow.
  hero: {
    borderRadius: radius.xl,
    paddingTop: space[6],
    paddingBottom: space[5],
    paddingHorizontal: space[5],
    backgroundColor: colors.surface.dark,
    alignItems: "center",
    overflow: "hidden",
    ...shadow.spotlight,
  },
  nextUp: { ...textPresets.tag, color: colors.accent.strong },
  avatarWrap: {
    marginTop: space[4],
    width: AVATAR,
    height: AVATAR,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: { position: "absolute", top: HALO_OFFSET, left: HALO_OFFSET },
  heroName: {
    ...textPresets.screenTitle,
    color: colors.text.primary,
    marginTop: space[3],
    textAlign: "center",
  },
  heroMeta: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    marginTop: space[2],
  },
  deckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  deckDivider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  deckRank: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    width: 16,
  },
  deckName: { ...textPresets.rowName, color: colors.text.primary, flex: 1 },
  deckPicks: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
  },
});
