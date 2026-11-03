import { Pressable, Text } from "react-native";

import { borderWidth, createThemedStyles, fontFamily, fontSize, pressedOpacity, radius, space } from "../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// AppButton is the pill-shaped action button. RN's built-in <Button> can't
// express it, so screens use this. Presentation only; logic stays in screens.
//   primary   = accent fill with text.onAccent ink. One per screen, for the
//               main action.
//   secondary = transparent with a strong hairline outline, primary-text label
//   ghost     = no chrome, secondary-text label (e.g. "Skip turn")
//   danger    = no chrome, red label
// size "sm" is the compact button for inline links and secondary action rows.
// `strong` gives a ghost the primary-text label (e.g. "See full rotation →").
// Disabled, primary and secondary turn neutral (surface.subtle fill,
// text.tertiary label), never a faded accent; ghost and danger just dim.
export function AppButton({
  title,
  onPress,
  disabled = false,
  variant = "primary",
  size = "md",
  strong = false,
  fullWidth = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  size?: "sm" | "md";
  strong?: boolean;
  fullWidth?: boolean;
}) {
  const styles = useStyles();
  const labelStyles = useLabelStyles();
  const ghostLike = variant === "ghost" || variant === "danger";
  const sm = size === "sm";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        ghostLike ? (sm ? styles.ghostPaddingSm : styles.ghostPadding) : sm ? styles.paddingSm : styles.padding,
        fullWidth && styles.fullWidth,
        styles[variant],
        disabled && (ghostLike ? styles.dimmed : styles.neutral),
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          sm && styles.labelSm,
          labelStyles[variant],
          strong && variant === "ghost" && labelStyles.strong,
          disabled && !ghostLike && labelStyles.neutral,
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors) => ({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderRadius: radius.full,
    borderWidth: borderWidth.hairline,
    borderColor: "transparent",
  },
  // The DS sets the label at line-height 1 with 13px padding; RN clips
  // descenders at line-height 1, so the 2px move from padding to line-height
  // and the button keeps the DS height (44).
  padding: { paddingVertical: 12, paddingHorizontal: 22 },
  ghostPadding: { paddingVertical: 12, paddingHorizontal: 6 },
  paddingSm: { paddingVertical: 7, paddingHorizontal: 16 },
  ghostPaddingSm: { paddingVertical: 7, paddingHorizontal: 4 },
  fullWidth: { alignSelf: "stretch" },
  primary: { backgroundColor: colors.accent.base },
  secondary: { borderColor: colors.border.strong },
  ghost: {},
  danger: {},
  neutral: { backgroundColor: colors.surface.subtle, borderColor: "transparent" },
  dimmed: { opacity: 0.45 },
  pressed: { opacity: pressedOpacity },
  label: { fontFamily: fontFamily.sansBold, fontSize: fontSize.base, lineHeight: fontSize.base + 2 },
  labelSm: { fontSize: fontSize.sm, lineHeight: fontSize.sm + 2 },
}));

const useLabelStyles = createThemedStyles((colors) => ({
  primary: { color: colors.text.onAccent },
  secondary: { color: colors.text.primary },
  ghost: { color: colors.text.secondary },
  danger: { color: colors.text.danger },
  strong: { color: colors.text.primary },
  neutral: { color: colors.text.tertiary },
}));
