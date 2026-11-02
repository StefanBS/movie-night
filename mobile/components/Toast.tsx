import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";

import { borderWidth, createThemedStyles, fontFamily, fontSize, radius, space, useColors } from "../theme";

// A short confirmation shown over whatever screen is up, e.g. "Reminder set"
// after a save that also navigates away. One at a time; a new one replaces it.
export type ToastMessage = { title: string; body: string };

const VISIBLE_MS = 3000;
const FADE_MS = 200;

const ToastContext = createContext<(message: ToastMessage) => void>(() => {});

export function useToast(): (message: ToastMessage) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (next: ToastMessage) => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      setMessage(next);
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
          setMessage(null),
        );
      }, VISIBLE_MS);
    },
    [opacity],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message !== null ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.wrap, { bottom: insets.bottom + space[6], opacity }]}
        >
          <View style={styles.card}>
            <View style={styles.check}>
              <Check size={12} color={colors.surface.page} strokeWidth={3.2} />
            </View>
            <View style={styles.text}>
              <Text style={styles.title}>{message.title}</Text>
              <Text style={styles.body}>{message.body}</Text>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const useStyles = createThemedStyles((colors, shadow) => ({
  wrap: { position: "absolute", left: space[5], right: space[5] },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingVertical: 14,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.surface.raised,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    ...shadow.md,
  },
  check: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: radius.full,
    backgroundColor: colors.text.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.base,
    lineHeight: Math.round(fontSize.base * 1.3),
    color: colors.text.primary,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: Math.round(fontSize.sm * 1.4),
    color: colors.text.secondary,
  },
}));
