import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import {
  AppButton,
  MemberRow,
  Calendar,
  SectionLabel,
  SettingsRow,
  TopBar,
  useToast,
} from "../";
import { useHardwareBack } from "../useHardwareBack";
import { useSession } from "../useSession";
import { AttendCheck } from "./AttendCheck";
import { RemindersView } from "./RemindersView";
import { RepeatView } from "./RepeatView";
import { StartTimeRow } from "./StartTimeRow";
import { WizardFooter } from "./WizardFooter";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { firstName } from "../../lib/avatar";
import { shiftMonth, yearMonthOf, type YearMonth } from "../../lib/calendar";
import {
  formatShortDate,
  formatStartTime,
  formatWeekdayDate,
} from "../../lib/date";
import type { Member } from "../../lib/members";
import { createNightEdit } from "../../lib/nightEdit";
import { isWatched, nightWording } from "../../lib/nightLifecycle";
import { capitalize } from "../../lib/text";
import { nightPicker, type Night } from "../../lib/nights";
import { formatRepeatLabel } from "../../lib/repeat";
import {
  formatRemindersSummary,
  reminderConfirmation,
  sameReminders,
} from "../../lib/reminders";
import { borderWidth, createThemedStyles, fontFamily, radius, space, textPresets, useColors } from "../../theme";

// EditNightScreen renders the edit module (lib/nightEdit), opened from Tonight
// or a Night; `back` names that screen. Change the date and start time, toggle who's coming, then save both in one
// request, or cancel the night. Date, Repeat and Reminders are steps over the same
// draft, so they save (or are discarded) with it. Mount with key={night.id}
// when the loaded night changes.
export function EditNightScreen({
  night,
  members,
  today,
  nightDates,
  back,
  onSaved,
  onCancelled,
}: {
  night: Night;
  members: Member[];
  today: string;
  nightDates: Set<string>;
  back: { label: string; onPress: () => void };
  onSaved: () => void;
  onCancelled: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [edit, state] = useSession(() =>
    createNightEdit({ baseUrl: API_URL, groupId: GROUP_ID, night, members }),
  );
  const showToast = useToast();
  const [mode, setMode] = useState<"main" | "date" | "repeat" | "reminders">("main");
  // Date, Repeat and Reminders return to the form, on screen and on Android's back
  // button, so the draft survives.
  const toMain = useCallback(() => setMode("main"), []);
  useHardwareBack(mode === "main" ? null : toMain);
  const [month, setMonth] = useState<YearMonth>(() =>
    yearMonthOf(night.scheduledFor),
  );
  const { date, startTime, attendees, reminders, repeat, rows, dirty, actionError } = state;
  const busy = state.busy !== null;
  const picker = nightPicker(state.night);
  const wording = nightWording(date, today);

  const onSave = async () => {
    const remindersChanged = !sameReminders(reminders, state.night.reminders);
    const saved = await edit.save();
    if (saved === null) {
      return;
    }
    if (remindersChanged) {
      showToast(reminderConfirmation(saved.reminders, saved.startTime));
    }
    onSaved();
  };

  const onCancelNight = async () => {
    if (await edit.cancelNight()) {
      onCancelled();
    }
  };

  if (mode === "reminders") {
    return (
      <RemindersView
        reminders={reminders}
        startTime={startTime}
        onChange={edit.setReminders}
        onDone={toMain}
      />
    );
  }

  if (mode === "repeat") {
    return (
      <RepeatView
        date={date}
        today={today}
        repeat={repeat}
        onChange={edit.setRepeat}
        onDone={toMain}
      />
    );
  }

  if (mode === "date") {
    return (
      <View style={styles.screen}>
        <TopBar
          kind="title"
          title="Date"
          back={{ label: "Edit night", onPress: toMain }}
        />
        <View style={styles.flex}>
          <ScrollView contentContainerStyle={styles.dateContent}>
            <View style={styles.calendarCard}>
              <Calendar
                value={date}
                today={today}
                month={month}
                nightDates={nightDates}
                onPick={edit.setDate}
                onMonth={(dir) => setMonth((m) => shiftMonth(m, dir))}
              />
            </View>
          </ScrollView>
          <WizardFooter>
            <AppButton
              title="Done"
              fullWidth
              onPress={toMain}
            />
          </WizardFooter>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="Edit night" back={back} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          {actionError !== null ? (
            <Text style={styles.error}>{actionError}</Text>
          ) : null}

          <View style={styles.hero}>
            <Text style={styles.heroDate} numberOfLines={1}>
              {formatWeekdayDate(date)}
            </Text>
            <Text style={styles.heroMeta}>
              {capitalize(
                [
                  wording.countdown,
                  startTime !== null ? formatStartTime(startTime) : null,
                  wording.pickerTitle(firstName(picker.name)),
                ]
                  .filter((part) => part !== null)
                  .join(" · "),
              )}
            </Text>
          </View>

          <SectionLabel>Night settings</SectionLabel>
          <View style={styles.card}>
            <View style={styles.divider}>
              <SettingsRow
                label="Date"
                value={formatShortDate(date)}
                right={<ChevronRight size={18} color={colors.text.tertiary} />}
                onPress={() => setMode("date")}
              />
            </View>
            <View style={styles.divider}>
              <StartTimeRow startTime={startTime} onChange={edit.setStartTime} disabled={busy} />
            </View>
            {/* A Watched Night can't repeat (ADR-0014): its series has moved on. */}
            {!isWatched(state.night) ? (
              <View style={styles.divider}>
                <SettingsRow
                  label="Repeat"
                  value={formatRepeatLabel(repeat, date)}
                  right={<ChevronRight size={18} color={colors.text.tertiary} />}
                  onPress={() => setMode("repeat")}
                />
              </View>
            ) : null}
            <SettingsRow
              label="Reminders"
              value={formatRemindersSummary(reminders, startTime)}
              right={<ChevronRight size={18} color={colors.text.tertiary} />}
              onPress={() => setMode("reminders")}
            />
          </View>

          <SectionLabel>{`Who's coming · ${attendees.size}`}</SectionLabel>
          <View>
            {rows.map((m, i) => {
              const here = attendees.has(m.id);
              // The picker is always an attendee; change the picker (from the
              // Night) before taking them off the night.
              const isPicker = m.id === picker.id;
              return (
                <MemberRow
                  key={m.id}
                  name={m.name}
                  meta={isPicker ? "Picker" : undefined}
                  dimmed={!here}
                  divider={i < rows.length - 1}
                  onPress={() => edit.toggle(m.id)}
                  disabled={busy || isPicker}
                  accessibilityHint={isPicker ? "Change the picker first" : undefined}
                  right={<AttendCheck on={here} />}
                />
              );
            })}
          </View>
        </ScrollView>

        <WizardFooter>
          <AppButton
            title="Save changes"
            fullWidth
            disabled={busy || !dirty}
            onPress={onSave}
          />
          <View style={styles.cancelWrap}>
            <AppButton
              title="Cancel this night"
              variant="danger"
              disabled={busy}
              onPress={onCancelNight}
            />
          </View>
        </WizardFooter>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[6] },
  dateContent: { paddingHorizontal: space[5], paddingTop: space[4], paddingBottom: space[6] },
  error: { ...textPresets.body, color: colors.text.danger, marginBottom: space[3] },
  hero: { marginTop: space[3], marginBottom: space[1] },
  heroDate: {
    fontFamily: fontFamily.display,
    fontSize: 32,
    lineHeight: 32,
    letterSpacing: 32 * -0.04,
    color: colors.text.primary,
  },
  heroMeta: { ...textPresets.meta, color: colors.text.secondary, marginTop: space[2] },
  // Cards sit on the page by fill alone, as on the board: no hairline edge.
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  calendarCard: {
    padding: space[4],
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
  },
  cancelWrap: { alignItems: "center" },
}));
