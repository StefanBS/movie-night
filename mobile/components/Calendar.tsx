import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { IconButton } from "./IconButton";
import { dayState, monthGrid, type YearMonth } from "../lib/calendar";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  shadow,
  space,
  textPresets,
} from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// Calendar is the bonfire-styled month date picker. It is purely presentational:
// it computes its cells from `month` via monthGrid, classifies each day with
// dayState, and reports taps. The owner holds `value` (selected ISO) and `month`.
export function Calendar({
  value,
  today,
  month,
  nightDates,
  onPick,
  onMonth,
}: {
  value: string;
  today: string;
  month: YearMonth;
  nightDates: Set<string>;
  onPick: (iso: string) => void;
  onMonth: (dir: -1 | 1) => void;
}) {
  const cells = monthGrid(month.year, month.month);
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.monthName} allowFontScaling={false}>
          {`${MONTH_NAMES[month.month - 1]} ${month.year}`}
        </Text>
        <View style={styles.chevrons}>
          <IconButton
            icon={<ChevronLeft size={17} color={colors.text.secondary} />}
            onPress={() => onMonth(-1)}
            accessibilityLabel="Previous month"
          />
          <IconButton
            icon={<ChevronRight size={17} color={colors.text.secondary} />}
            onPress={() => onMonth(1)}
            accessibilityLabel="Next month"
          />
        </View>
      </View>

      <View style={styles.weekdays}>
        {WEEKDAY_INITIALS.map((w, i) => (
          <Text key={i} style={styles.weekday} allowFontScaling={false}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (cell === null) {
            return <View key={`blank-${i}`} style={styles.cell} />;
          }
          const state = dayState(cell.iso, { selected: value, today, nightDates });
          return (
            <Pressable
              key={cell.iso}
              onPress={() => onPick(cell.iso)}
              accessibilityRole="button"
              accessibilityLabel={cell.iso}
              style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
            >
              <View
                style={[
                  styles.circle,
                  state.today && !state.selected && styles.todayRing,
                  state.selected && styles.selectedCircle,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    state.past && !state.selected && styles.pastText,
                    state.selected && styles.selectedText,
                  ]}
                  allowFontScaling={false}
                >
                  {cell.day}
                </Text>
              </View>
              <View style={[styles.dot, state.hasNight && styles.dotOn]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const COLUMN = "14.2857%"; // 100% / 7

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[3],
  },
  monthName: { ...textPresets.barTitle, color: colors.text.primary },
  chevrons: { flexDirection: "row", gap: space[2] },
  weekdays: { flexDirection: "row", marginBottom: space[1] },
  weekday: {
    width: COLUMN,
    textAlign: "center",
    fontFamily: fontFamily.monoBold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: COLUMN, alignItems: "center", paddingVertical: space[1] },
  pressed: { opacity: pressedOpacity },
  circle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  todayRing: { borderWidth: borderWidth.regular, borderColor: colors.accent.strong },
  selectedCircle: { backgroundColor: colors.accent.base, ...shadow.spotlight },
  dayText: { fontFamily: fontFamily.sans, fontSize: fontSize.base, color: colors.text.primary },
  pastText: { color: colors.text.tertiary },
  selectedText: { fontFamily: fontFamily.sansBold, color: colors.text.onAccent },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radius.full,
    marginTop: space[1],
    backgroundColor: "transparent",
  },
  dotOn: { backgroundColor: colors.accent.strong },
});
