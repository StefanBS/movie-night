import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar as CalendarIcon, ChevronRight } from "lucide-react-native";

import {
  AppButton,
  Avatar,
  Badge,
  Calendar,
  SectionLabel,
  SettingsRow,
  TabScrollView,
  TopBar,
} from "../";
import { useSession } from "../useSession";
import { WizardFooter } from "./WizardFooter";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { firstName } from "../../lib/avatar";
import { shiftMonth, yearMonthOf, type YearMonth } from "../../lib/calendar";
import {
  countdownLabel,
  formatShortDate,
  formatWeekdayDate,
} from "../../lib/date";
import type { Member } from "../../lib/members";
import { createNightEdit } from "../../lib/nightEdit";
import type { Night } from "../../lib/nights";
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
  trackPx,
} from "../../theme";

// EditNightScreen renders the edit module (lib/nightEdit) from the home
// Up-next card: change the date, toggle who's coming, then save both in one
// request, or cancel the night. Reminders route to the deferred #50 screen.
// Mount with key={night.id} when the loaded night changes.
export function EditNightScreen({
  night,
  members,
  today,
  nightDates,
  onBack,
  onSaved,
  onCancelled,
  onReminders,
}: {
  night: Night;
  members: Member[];
  today: string;
  nightDates: Set<string>;
  onBack: () => void;
  onSaved: () => void;
  onCancelled: () => void;
  onReminders: () => void;
}) {
  const [edit, state] = useSession(() =>
    createNightEdit({ baseUrl: API_URL, groupId: GROUP_ID, night, members }),
  );
  const [mode, setMode] = useState<"main" | "date">("main");
  const [month, setMonth] = useState<YearMonth>(() =>
    yearMonthOf(night.scheduledFor),
  );
  const { date, attendees, rows, dirty, actionError } = state;
  const busy = state.busy !== null;
  const pickerId = state.night.pickerId;
  const picker = members.find((m) => m.id === pickerId) ?? null;

  const onSave = async () => {
    if ((await edit.save()) !== null) {
      onSaved();
    }
  };

  const onCancelNight = async () => {
    if (await edit.cancelNight()) {
      onCancelled();
    }
  };

  if (mode === "date") {
    return (
      <View style={styles.screen}>
        <TopBar
          kind="title"
          title="Date"
          back={{ label: "Edit night", onPress: () => setMode("main") }}
        />
        <View style={styles.flex}>
          <TabScrollView contentContainerStyle={styles.dateContent}>
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
          </TabScrollView>
          <WizardFooter>
            <AppButton
              title="Done"
              fullWidth
              onPress={() => setMode("main")}
            />
          </WizardFooter>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="Edit night" back={{ label: "Up next", onPress: onBack }} />
      <View style={styles.flex}>
        <TabScrollView contentContainerStyle={styles.content}>
          {actionError !== null ? (
            <Text style={styles.error}>{actionError}</Text>
          ) : null}

          <View style={styles.heroRow}>
            <View style={styles.heroTile}>
              <CalendarIcon size={22} color={colors.accent.strong} strokeWidth={2} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroDate} numberOfLines={1}>
                {formatWeekdayDate(date)}
              </Text>
              <Text style={styles.heroMeta} allowFontScaling={false}>
                {picker !== null
                  ? `${countdownLabel(date, today)} · ${firstName(picker.name)} picks`
                  : countdownLabel(date, today)}
              </Text>
            </View>
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
            <SettingsRow
              label="Reminders"
              value="Day before, morning of"
              right={<ChevronRight size={18} color={colors.text.tertiary} />}
              onPress={onReminders}
            />
          </View>

          <SectionLabel>{`Who's coming · ${attendees.size}`}</SectionLabel>
          <View>
            {rows.map((m, i) => {
              const here = attendees.has(m.id);
              // The picker is always an attendee; change the picker (from the
              // Night) before taking them off the night.
              const isPicker = m.id === pickerId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => edit.toggle(m.id)}
                  disabled={busy || isPicker}
                  accessibilityHint={isPicker ? "Change the picker first" : undefined}
                  style={({ pressed }) => [
                    styles.attendRow,
                    i < rows.length - 1 && styles.attendDivider,
                    !here && styles.dimmed,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Avatar name={m.name} size={40} />
                  <View style={styles.memberText}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.name}
                    </Text>
                    {isPicker ? (
                      <Text style={styles.pickerHint} allowFontScaling={false}>
                        PICKER · CHANGE THE PICKER FIRST
                      </Text>
                    ) : null}
                  </View>
                  {here ? (
                    <Badge label="✓ In" tone="solid" uppercase={false} />
                  ) : (
                    <Text style={styles.outTag} allowFontScaling={false}>
                      OUT
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </TabScrollView>

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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[6] },
  dateContent: { paddingHorizontal: space[5], paddingTop: space[4], paddingBottom: space[6] },
  error: { ...textPresets.body, color: colors.text.danger, marginBottom: space[3] },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    marginTop: space[2],
    marginBottom: space[1],
  },
  heroTile: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.spotlight,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.glow,
    ...shadow.spotlight,
  },
  heroText: { flex: 1, minWidth: 0 },
  heroDate: {
    fontFamily: fontFamily.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: trackPx(26, "display"),
    color: colors.text.primary,
  },
  heroMeta: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.accent.strong,
    textTransform: "uppercase",
    letterSpacing: trackPx(fontSize.caption, "caption"),
    marginTop: space[1],
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  divider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  attendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[2],
  },
  attendDivider: {
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border.hairline,
  },
  dimmed: { opacity: 0.5 },
  rowPressed: { opacity: pressedOpacity },
  memberText: { flex: 1 },
  memberName: { ...textPresets.rowName, color: colors.text.primary },
  pickerHint: { ...textPresets.tag, color: colors.text.tertiary, marginTop: space[1] },
  outTag: { ...textPresets.tag, color: colors.text.tertiary },
  calendarCard: {
    padding: space[4],
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
    borderRadius: radius.lg,
  },
  cancelWrap: { alignItems: "center" },
});
