import { ScrollView, type ScrollViewProps } from "react-native";
import { useBottomTabBarHeight } from "expo-router/js-tabs";

import { space } from "../theme";

// useTabBarPadding is the bottom padding that keeps a tab screen's last row
// clear of the tab bar, for the tab screens only: outside the tab navigator the
// bar height is unavailable and it throws. The tab bar is absolutely positioned
// and overlays content, so the last row would be hidden; this reads the live bar
// height (reported by SpotlightTabBar in (tabs)/_layout). A tab screen that
// scrolls with a list (Watched's SectionList) merges it into its
// contentContainerStyle.
export function useTabBarPadding() {
  return { paddingBottom: useBottomTabBarHeight() + space[5] };
}

// TabScrollView is a tab screen's ScrollView with that padding. Callers pass
// their own contentContainerStyle (e.g. horizontal padding) and it is merged
// with the bar padding.
export function TabScrollView({
  contentContainerStyle,
  ...rest
}: ScrollViewProps) {
  const tabBarPadding = useTabBarPadding();
  return (
    <ScrollView
      contentContainerStyle={[contentContainerStyle, tabBarPadding]}
      {...rest}
    />
  );
}
