import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logomark } from "./Logomark";
import { colors, pressedOpacity, space, textPresets } from "../theme";

// The app's shared top-bar chrome, in the three kinds the redesign uses:
//   home  — logomark + "Movie Night" wordmark + group name + right slot (Tonight)
//   tab   — large left-aligned serif title + optional mono sub + right slot
//   title — centered serif title + ember back link + right slot (pushed screens)
type TopBarProps =
  | { kind: "home"; group: string; right?: ReactNode }
  | { kind: "tab"; title: string; sub?: string; right?: ReactNode }
  | {
      kind: "title";
      title: string;
      back?: string;
      onBack?: () => void;
      right?: ReactNode;
    };

export function TopBar(props: TopBarProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + space[2];

  if (props.kind === "home") {
    return (
      <View style={[styles.row, { paddingTop }]}>
        <View style={styles.homeLeft}>
          <Logomark size={30} />
          <View style={styles.flexShrink}>
            <Text style={styles.wordmark} allowFontScaling={false}>
              Movie Night
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {props.group}
            </Text>
          </View>
        </View>
        {props.right}
      </View>
    );
  }

  if (props.kind === "tab") {
    return (
      <View style={[styles.row, styles.tabRow, { paddingTop }]}>
        <View style={styles.flexShrink}>
          <Text style={styles.tabTitle} allowFontScaling={false}>
            {props.title}
          </Text>
          {props.sub ? <Text style={styles.meta}>{props.sub}</Text> : null}
        </View>
        {props.right}
      </View>
    );
  }

  return (
    <View style={[styles.titleBar, { paddingTop }]}>
      {props.back ? (
        <Pressable
          onPress={props.onBack}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${props.back}`}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <ChevronLeft size={18} color={colors.accent.strong} strokeWidth={2.4} />
          <Text style={styles.backText}>{props.back}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.barTitle} allowFontScaling={false} numberOfLines={1}>
        {props.title}
      </Text>
      {props.right ? <View style={styles.titleRight}>{props.right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[5],
    paddingBottom: space[2],
  },
  tabRow: { alignItems: "flex-end" },
  homeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    flexShrink: 1,
  },
  flexShrink: { flexShrink: 1 },
  wordmark: { ...textPresets.wordmark, color: colors.text.primary },
  tabTitle: { ...textPresets.tabTitle, color: colors.text.primary },
  meta: { ...textPresets.barMeta, color: colors.text.tertiary, marginTop: space[1] },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[5],
    paddingBottom: space[2],
    minHeight: 44,
  },
  back: {
    position: "absolute",
    left: space[3],
    bottom: space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
  },
  backText: { ...textPresets.backLink, color: colors.accent.strong },
  barTitle: { ...textPresets.barTitle, color: colors.text.primary },
  titleRight: { position: "absolute", right: space[4], bottom: space[2] },
  pressed: { opacity: pressedOpacity },
});
