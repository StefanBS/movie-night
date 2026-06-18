import { useContext, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  BottomTabBarHeightCallbackContext,
  Tabs,
  type BottomTabBarProps,
} from "expo-router/js-tabs";
import { BlurView } from "expo-blur";
import {
  Clapperboard,
  History,
  Settings,
  UsersRound,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { borderWidth, colors, fontFamily, space, textPresets } from "../../theme";

type IconProps = { size: number; color: string; strokeWidth?: number };

// Route name → tab glyph + label. Order here drives the bar order.
const TABS: { name: string; label: string; Icon: ComponentType<IconProps> }[] = [
  { name: "index", label: "Tonight", Icon: Clapperboard },
  { name: "history", label: "History", Icon: History },
  { name: "club", label: "The Club", Icon: UsersRound },
  { name: "settings", label: "Settings", Icon: Settings },
];

function SpotlightTabBar({ state, navigation }: BottomTabBarProps) {
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
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
      <View accessibilityRole="tablist" style={styles.items}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const focused = state.index === index;
          const color = focused ? colors.accent.strong : colors.text.tertiary;
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
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
              <tab.Icon size={23} color={color} strokeWidth={2} />
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
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="club" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
    justifyContent: "space-around",
    alignItems: "flex-end",
  },
  item: { alignItems: "center", gap: space[1], width: 64 },
  label: { ...textPresets.tabLabel },
  labelActive: { fontFamily: fontFamily.sansBold },
});
