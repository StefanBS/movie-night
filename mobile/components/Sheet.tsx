import { type ComponentType, type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, pressedOpacity, radius, space, textPresets, useColors } from "../theme";

// Sheet is the bottom action sheet behind a screen's ⋯ button: the secondary
// actions (Change film, Edit night, Clear film) live here, so the screen keeps
// one clear action, or none. Tapping the scrim or the back button closes it.
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space[6] }]}>
          <View style={styles.grabber} />
          {title !== undefined ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

// SheetRow is one action in a Sheet: an icon, a label and an optional line
// saying what it does. `danger` sets it in red, for destructive actions.
export function SheetRow({
  icon: Icon,
  label,
  sub,
  danger = false,
  last = false,
  onPress,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  sub?: string;
  danger?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <Icon size={20} color={danger ? colors.text.danger : colors.text.secondary} />
      <View style={styles.rowText}>
        <Text style={[styles.label, danger && styles.danger]}>{label}</Text>
        {sub !== undefined ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles((colors, shadow) => ({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.surface.scrim },
  sheet: {
    backgroundColor: colors.surface.raised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space[3],
    paddingHorizontal: space[5],
    ...shadow.lg,
  },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.border.strong,
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 13,
    lineHeight: lh(13),
    color: colors.text.secondary,
    marginBottom: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.border.hairline },
  pressed: { opacity: pressedOpacity },
  rowText: { flex: 1, minWidth: 0 },
  label: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.base, lineHeight: lh(fontSize.base, "snug"), color: colors.text.primary },
  danger: { color: colors.text.danger },
  sub: { ...textPresets.meta, fontSize: 13, lineHeight: lh(13), color: colors.text.tertiary, marginTop: 2 },
}));
