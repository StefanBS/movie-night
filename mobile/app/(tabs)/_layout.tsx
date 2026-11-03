import { useContext, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BottomTabBarHeightCallbackContext,
  Tabs,
  type BottomTabBarProps,
} from "expo-router/js-tabs";
import { BlurView } from "expo-blur";
import {
  CalendarDays,
  Clapperboard,
  Library,
  UsersRound,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderWidth, createThemedStyles, fontFamily, space, textPresets, useColors, useScheme } from "../../theme";

type IconProps = { size: number; color: string; strokeWidth?: number };

// Route name → tab glyph + label. Order here drives the bar order: now, next,
// past, people. Settings is not a tab; it opens from the gear on Tonight.
const TABS: { name: string; label: string; Icon: ComponentType<IconProps> }[] = [
  { name: "index", label: "Tonight", Icon: Clapperboard },
  { name: "upcoming", label: "Upcoming", Icon: CalendarDays },
  { name: "watched", label: "Watched", Icon: Library },
  { name: "club", label: "Club", Icon: UsersRound },
];

function SpotlightTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const colors = useColors();
  const scheme = useScheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // The bar is absolutely positioned, so it overlays screen content. Report its
  // real measured height up the tree so screens can read useBottomTabBarHeight()
  // and pad their scroll content clear of it (the default estimate is too short
  // for this custom bar).
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom + space[2] }]}
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      <BlurView intensity={24} tint={scheme} style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
      <View accessibilityRole="tablist" style={styles.items}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const focused = state.index === index;
          // Never the accent, and no badges or dots: weight and ink carry state.
          const color = focused ? colors.text.primary : colors.text.secondary;
          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              style={styles.item}
            >
              <tab.Icon size={24} color={color} strokeWidth={2} />
              <Text
                allowFontScaling={false}
                style={[styles.label, { color }, focused && styles.labelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <SpotlightTabBar {...props} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} />
      ))}
    </Tabs>
  );
}

const useStyles = createThemedStyles((colors) => ({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space[2],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
    overflow: "hidden",
  },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: colors.surface.tabBar },
  items: {
    flexDirection: "row",
    paddingHorizontal: space[2],
  },
  // Equal-width tabs, each a tap target at least 48 tall.
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: space[1],
    paddingVertical: space[1],
  },
  label: { ...textPresets.tabLabel },
  labelActive: { fontFamily: fontFamily.sansSemibold },
}));
