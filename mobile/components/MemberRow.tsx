import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { borderWidth, createThemedStyles, fontFamily, fontSize, pressedOpacity, space, tabular, textPresets, trackPx } from "../theme";
import { Avatar } from "./Avatar";

// MemberRow is the shared roster row. Rows sit flush on the page, separated by
// hairlines (`divider`, usually on all but the last) — no card around a list.
// `highlighted` marks the picker with a heavier, larger name: no ring, fill or
// glow. `rank` is the turn position (terracotta on the picker), `muted` dims
// an inactive member. A string `right` is trailing text ("2 picks"); any
// other node (a badge, a chevron) renders as is.
export function MemberRow({
  name,
  meta,
  rank,
  highlighted = false,
  muted = false,
  divider = false,
  right,
  onPress,
}: {
  name: string;
  meta?: string;
  rank?: number;
  highlighted?: boolean;
  muted?: boolean;
  divider?: boolean;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const content = (
    <>
      {rank != null ? (
        <Text style={[styles.rank, highlighted && styles.rankHighlighted]}>{rank}</Text>
      ) : null}
      <Avatar name={name} />
      <View style={styles.text}>
        <Text style={[styles.name, highlighted && styles.nameHighlighted]} numberOfLines={1}>
          {name}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {typeof right === "string" ? (
        <Text style={styles.trailing} numberOfLines={1}>
          {right}
        </Text>
      ) : right ? (
        <View>{right}</View>
      ) : null}
    </>
  );

  const rowStyle = [styles.row, divider && styles.divider, muted && styles.muted];
  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const NAME_HIGHLIGHTED = 20;

const useStyles = createThemedStyles((colors) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: "transparent",
  },
  divider: { borderBottomColor: colors.border.hairline },
  muted: { opacity: 0.55 },
  pressed: { opacity: pressedOpacity },
  rank: {
    fontFamily: fontFamily.sansBold,
    ...tabular,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    width: 16,
  },
  rankHighlighted: { color: colors.accent.strong },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    ...textPresets.rowName,
    lineHeight: Math.round(fontSize.lg * 1.25),
    color: colors.text.primary,
  },
  nameHighlighted: {
    fontFamily: fontFamily.display,
    fontSize: NAME_HIGHLIGHTED,
    lineHeight: Math.round(NAME_HIGHLIGHTED * 1.25),
    letterSpacing: trackPx(NAME_HIGHLIGHTED, "title"),
  },
  meta: { ...textPresets.meta, ...tabular, color: colors.text.secondary },
  trailing: { ...textPresets.meta, ...tabular, color: colors.text.secondary },
}));
