import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logomark } from "./Logomark";
import { createThemedStyles, fontFamily, lh, pressedOpacity, space, textPresets, useColors } from "../theme";

// The app's shared top-bar chrome, in the three kinds the redesign uses:
//   home  — logomark + "Movie Night" wordmark + group name + right slot (Tonight)
//   tab   — large left-aligned title + optional serif sub + right slot
//   title — centered title + back link (primary text) + right slot (pushed screens)
// `back` couples its label and handler so a title bar can't render a dead button.
type TopBarProps =
  | { kind: "home"; group: string; right?: ReactNode }
  | { kind: "tab"; title: string; sub?: string; right?: ReactNode }
  | {
      kind: "title";
      title: string;
      back?: { label: string; onPress: () => void };
      right?: ReactNode;
    };

const BAR_HEIGHT = 52;

export function TopBar(props: TopBarProps) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + space[2];
  // The bar is 52 tall below the status bar, whatever its kind.
  const minHeight = insets.top + BAR_HEIGHT;

  if (props.kind === "home") {
    return (
      <View style={[styles.row, { paddingTop, minHeight }]}>
        <View style={styles.homeLeft}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Logomark size={22} />
          </View>
          <View style={styles.flexShrink}>
            <Text style={styles.wordmark} allowFontScaling={false}>
              Movie Night
            </Text>
            <Text style={styles.group} numberOfLines={1}>
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
      <View style={[styles.row, styles.tabRow, { paddingTop: insets.top + space[4], minHeight }]}>
        <View style={styles.flexShrink}>
          <Text style={styles.tabTitle} allowFontScaling={false} numberOfLines={1}>
            {props.title}
          </Text>
          {props.sub ? <Text style={styles.sub}>{props.sub}</Text> : null}
        </View>
        {props.right}
      </View>
    );
  }

  return (
    <View style={[styles.titleBar, { paddingTop, minHeight }]}>
      {props.back ? (
        <Pressable
          onPress={props.back.onPress}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${props.back.label}`}
          style={({ pressed }) => [styles.back, { top: paddingTop }, pressed && styles.pressed]}
        >
          <ChevronLeft size={18} color={colors.text.primary} strokeWidth={2.4} />
          <Text style={styles.backText}>{props.back.label}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.barTitle} allowFontScaling={false} numberOfLines={1}>
        {props.title}
      </Text>
      {props.right ? <View style={[styles.titleRight, { top: paddingTop }]}>{props.right}</View> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    paddingHorizontal: space[5],
    paddingBottom: space[2],
  },
  tabRow: { alignItems: "flex-end" },
  homeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  flexShrink: { flexShrink: 1 },
  wordmark: { ...textPresets.wordmark, color: colors.text.primary },
  group: { ...textPresets.barMeta, color: colors.text.secondary },
  tabTitle: { ...textPresets.tabTitle, color: colors.text.primary },
  sub: {
    fontFamily: fontFamily.serifMedium,
    fontSize: 19,
    lineHeight: lh(19, "snug"),
    color: colors.text.secondary,
    marginTop: 6,
  },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[5],
    paddingBottom: space[2],
  },
  // Back and right are pinned between the bar's paddings (top set inline), so
  // they centre on the title.
  back: {
    position: "absolute",
    left: space[4],
    bottom: space[2],
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: space[1],
  },
  backText: { ...textPresets.backLink, color: colors.text.primary },
  barTitle: { ...textPresets.barTitle, color: colors.text.primary },
  titleRight: { position: "absolute", right: space[4], bottom: space[2], justifyContent: "center" },
  pressed: { opacity: pressedOpacity },
}));
