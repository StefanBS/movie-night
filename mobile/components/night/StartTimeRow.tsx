import { Platform } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { ChevronRight } from "lucide-react-native";

import { SettingsRow } from "../";
import { formatStartTime, startTimeDate, toStartTime } from "../../lib/date";
import { colors } from "../../theme";

// The time the OS clock opens at for a Night with no start time yet.
const DIAL_DEFAULT = "19:30";

// StartTimeRow is the optional start time of a Night (ADR-0011): "Not set"
// until chosen, opening the OS clock dialog, whose Clear button removes it.
// The dialog is Android's imperative picker, so other platforms don't show the
// row.
export function StartTimeRow({
  startTime,
  onChange,
  disabled = false,
}: {
  startTime: string | null;
  onChange: (startTime: string | null) => void;
  disabled?: boolean;
}) {
  if (Platform.OS !== "android") {
    return null;
  }
  const open = () =>
    DateTimePickerAndroid.open({
      value: startTimeDate(startTime ?? DIAL_DEFAULT),
      mode: "time",
      onValueChange: (_event, date) => onChange(toStartTime(date)),
      ...(startTime !== null
        ? { neutralButton: { label: "Clear" }, onNeutralButtonPress: () => onChange(null) }
        : {}),
    });
  return (
    <SettingsRow
      label="Start time"
      value={startTime !== null ? formatStartTime(startTime) : "Not set"}
      right={<ChevronRight size={18} color={colors.text.tertiary} />}
      onPress={open}
      disabled={disabled}
    />
  );
}
