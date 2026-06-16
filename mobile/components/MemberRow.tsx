import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  shadow,
  space,
  textPresets,
  trackPx,
} from "../theme";
import { Avatar } from "./Avatar";

// MemberRow is the shared roster row. `spotlight` gives the next-up member the ember
// "whose turn" treatment used across Tonight, The order, and The Club.
export function MemberRow({
  name,
  meta,
  rank,
  spotlight = false,
  avatarSize = 40,
  right,
  onPress,
}: {
  name: string;
  meta?: string;
  rank?: number;
  spotlight?: boolean;
  avatarSize?: number;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <>
      {rank != null ? (
        <Text style={[styles.rank, spotlight && styles.rankSpotlight]}>{rank}</Text>
      ) : null}
      <Avatar name={name} size={avatarSize} glow={spotlight} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, spotlight && styles.spotlight]}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        spotlight && styles.spotlight,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
  },
  spotlight: {
    backgroundColor: colors.surface.spotlight,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  pressed: { opacity: pressedOpacity },
  rank: {
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    width: 20,
    textAlign: "center",
  },
  rankSpotlight: { color: colors.accent.strong },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...textPresets.rowName, color: colors.text.primary },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    letterSpacing: trackPx(fontSize.caption, "normal"),
  },
  right: { marginLeft: space[2] },
});
