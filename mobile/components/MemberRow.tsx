import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { borderWidth, createThemedStyles, fontFamily, fontSize, pressedOpacity, space, tabular, textPresets, trackPx } from "../theme";
import { Avatar } from "./Avatar";

// MemberRow is the shared roster row. Rows sit flush on the page, separated by
// hairlines (`divider`, usually on all but the last) — no card around a list.
// `highlighted` marks the picker with a heavier, larger name: no ring, fill or
// glow. `rank` is the turn position (terracotta on the picker), `muted` dims
// an inactive member. `dimmed` marks someone who's out on an attendance row:
// the avatar and name fade but `right` (the AttendCheck) stays full strength.
// `metaTone="accent"` is for the picker's "Gets the pick". A string `right` is
// trailing text ("2 picks"); any other node (a badge, a chevron) renders as is.
export function MemberRow({
  name,
  meta,
  rank,
  highlighted = false,
  muted = false,
  dimmed = false,
  metaTone = "secondary",
  divider = false,
  right,
  onPress,
  disabled = false,
  accessibilityHint,
}: {
  name: string;
  meta?: string;
  rank?: number;
  highlighted?: boolean;
  muted?: boolean;
  dimmed?: boolean;
  metaTone?: "secondary" | "accent";
  divider?: boolean;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const styles = useStyles();
  const content = (
    <>
      {rank != null ? (
        <Text style={[styles.rank, highlighted && styles.rankHighlighted]}>{rank}</Text>
      ) : null}
      <View style={dimmed && styles.avatarDimmed}>
        <Avatar name={name} />
      </View>
      <View style={[styles.text, dimmed && styles.textDimmed]}>
        <Text style={[styles.name, highlighted && styles.nameHighlighted]} numberOfLines={1}>
          {name}
        </Text>
        {meta ? (
          <Text style={[styles.meta, metaTone === "accent" && styles.metaAccent]} numberOfLines={1}>
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
      disabled={disabled}
      accessibilityHint={accessibilityHint}
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
  avatarDimmed: { opacity: 0.4 },
  textDimmed: { opacity: 0.5 },
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
  metaAccent: { fontFamily: fontFamily.sansSemibold, color: colors.accent.strong },
  trailing: { ...textPresets.meta, ...tabular, color: colors.text.secondary },
}));
