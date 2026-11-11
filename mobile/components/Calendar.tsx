import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { IconButton } from "./IconButton";
import { dayState, monthGrid, type YearMonth } from "../lib/calendar";
import { formatWeekdayDate } from "../lib/date";
import { borderWidth, createThemedStyles, fontFamily, fontSize, pressedOpacity, radius, space, tabular, textPresets, useColors } from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// Calendar is the month date picker: the selected day is an accent disc, today
// a text-colour ring, a day with a night gets a dot, past days dim. It is purely presentational:
// it computes its cells from `month` via monthGrid, classifies each day with
// dayState, and reports taps. The owner holds `value` (selected ISO) and `month`.
// The header and each day carry a testID by date (month-2026-12, day-2026-12-01)
// so the E2E flows find them without rebuilding the labels.
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
  const colors = useColors();
  const styles = useStyles();
  const cells = monthGrid(month.year, month.month);
  return (
    <View>
      <View style={styles.header}>
        <Text
          style={styles.monthName}
          allowFontScaling={false}
          testID={`month-${month.year}-${String(month.month).padStart(2, "0")}`}
        >
          {`${MONTH_NAMES[month.month - 1]} `}
          <Text style={styles.year}>{month.year}</Text>
        </Text>
        <View style={styles.chevrons}>
          <IconButton
            icon={<ChevronLeft size={18} color={colors.text.primary} strokeWidth={2.2} />}
            onPress={() => onMonth(-1)}
            accessibilityLabel="Previous month"
            size="sm"
            filled
          />
          <IconButton
            icon={<ChevronRight size={18} color={colors.text.primary} strokeWidth={2.2} />}
            onPress={() => onMonth(1)}
            accessibilityLabel="Next month"
            size="sm"
            filled
          />
        </View>
      </View>

      <View style={styles.weekdays}>
        {WEEKDAY_INITIALS.map((w, i) => (
          <Text key={`${w}-${i}`} style={styles.weekday} allowFontScaling={false}>
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
              testID={`day-${cell.iso}`}
              onPress={() => onPick(cell.iso)}
              accessibilityRole="button"
              accessibilityLabel={formatWeekdayDate(cell.iso)}
              accessibilityState={{ selected: state.selected }}
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
                    state.today && styles.todayText,
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

const useStyles = createThemedStyles((colors) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[4],
  },
  monthName: { ...textPresets.sectionHeading, color: colors.text.primary },
  year: { fontFamily: fontFamily.sansSemibold, color: colors.text.tertiary },
  chevrons: { flexDirection: "row", gap: space[2] },
  weekdays: { flexDirection: "row" },
  weekday: {
    width: COLUMN,
    textAlign: "center",
    fontFamily: fontFamily.sansSemibold,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    paddingBottom: 6,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 2 },
  cell: { width: COLUMN, alignItems: "center", gap: 3, paddingVertical: 3 },
  pressed: { opacity: pressedOpacity },
  circle: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  todayRing: { boxShadow: `inset 0 0 0 ${borderWidth.regular}px ${colors.text.primary}` },
  selectedCircle: { backgroundColor: colors.accent.base },
  dayText: { fontFamily: fontFamily.sans, ...tabular, fontSize: fontSize.base, color: colors.text.primary },
  pastText: { color: colors.text.tertiary },
  todayText: { fontFamily: fontFamily.sansBold },
  selectedText: { fontFamily: fontFamily.sansBold, color: colors.text.onAccent },
  dot: { width: 4, height: 4, borderRadius: radius.full },
  dotOn: { backgroundColor: colors.text.primary },
}));
