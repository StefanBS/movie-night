import { useCallback } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";

// useHardwareBack makes Android's back button run onBack while the screen is
// focused, instead of popping the route. Screens whose steps are local state
// (not routes) pass their inner step's top-bar back action, and null on the
// first step so back leaves the screen as usual. Pass a stable function: a new
// one re-registers the listener. Predictive back is off (app.json), so this
// also covers the back gesture.
export function useHardwareBack(onBack: (() => void) | null) {
  useFocusEffect(
    useCallback(() => {
      if (onBack === null) {
        return;
      }
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        onBack();
        return true;
      });
      return () => sub.remove();
    }, [onBack]),
  );
}
