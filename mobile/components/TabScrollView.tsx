import { ScrollView, type ScrollViewProps } from "react-native";
import { useBottomTabBarHeight } from "expo-router/js-tabs";

import { space } from "../theme";

// TabScrollView is the scroll container for the tab screens. The tab bar is
// absolutely positioned and overlays content, so the last row would be hidden;
// this reads the live bar height (reported by SpotlightTabBar in (tabs)/_layout)
// and pads the scroll content clear of it. Callers pass their own
// contentContainerStyle (e.g. horizontal padding) and it is merged with the bar
// padding.
export function TabScrollView({
  contentContainerStyle,
  ...rest
}: ScrollViewProps) {
  const tabBarHeight = useBottomTabBarHeight();
  return (
    <ScrollView
      contentContainerStyle={[
        contentContainerStyle,
        { paddingBottom: tabBarHeight + space[5] },
      ]}
      {...rest}
    />
  );
}
