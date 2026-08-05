import { useCallback, useMemo, useState } from "react";
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
import { WizardFooter } from "./WizardFooter";
import { firstName } from "../../lib/avatar";
import { shiftMonth, yearMonthOf, type YearMonth } from "../../lib/calendar";
import {
  countdownLabel,
  formatShortDate,
  formatWeekdayDate,
} from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import type { Member } from "../../lib/members";
import {
  addAttendee,
  deleteNight,
  removeAttendee,
  updateNightDate,
  type Night,
} from "../../lib/nights";
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

// EditNightScreen is the scheduling edit flow from the home Up-next card:
// change the date, toggle who's coming, and cancel the night. Reminders
// route to the deferred #50 screen.
export function EditNightScreen({
  night,
  members,
  today,
  nightDates,
  apiUrl,
  groupId,
  onBack,
  onSaved,
  onCancelled,
  onReminders,
}: {
  night: Night;
  members: Member[];
  today: string;
  nightDates: Set<string>;
  apiUrl: string;
  groupId: string;
  onBack: () => void;
  onSaved: () => void;
  onCancelled: () => void;
  onReminders: () => void;
}) {
  const [mode, setMode] = useState<"main" | "date">("main");
  const [draftDate, setDraftDate] = useState(night.scheduledFor);
  const [draftAttendees, setDraftAttendees] = useState(
    () => new Set(night.attendees.map((a) => a.id)),
  );
  const [month, setMonth] = useState<YearMonth>(() =>
    yearMonthOf(night.scheduledFor),
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const coreMembers = useMemo(
    () => members.filter((m) => m.status === "active" && m.role === "core"),
    [members],
  );

  const picker = members.find((m) => m.id === night.pickerId) ?? null;

  const serverAttendeeIds = useMemo(
    () => new Set(night.attendees.map((a) => a.id)),
    [night],
  );

  const dirty =
    draftDate !== night.scheduledFor ||
    draftAttendees.size !== serverAttendeeIds.size ||
    [...draftAttendees].some((id) => !serverAttendeeIds.has(id));

  const toggleAttendee = useCallback((memberId: string) => {
    setDraftAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);

  const onSave = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      let current = night;
      if (draftDate !== night.scheduledFor) {
        current = await updateNightDate(apiUrl, groupId, night.id, draftDate);
      }
      const serverIds = new Set(current.attendees.map((a) => a.id));
      for (const id of draftAttendees) {
        if (!serverIds.has(id)) {
          current = await addAttendee(apiUrl, groupId, night.id, id);
        }
      }
      for (const a of current.attendees) {
        if (!draftAttendees.has(a.id)) {
          current = await removeAttendee(apiUrl, groupId, night.id, a.id);
        }
      }
      onSaved();
    } catch (e) {
      setActionError(errorMessage(e, "failed to save changes"));
    } finally {
      setBusy(false);
    }
  }, [apiUrl, groupId, night, draftDate, draftAttendees, busy, onSaved]);

  const onCancelNight = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await deleteNight(apiUrl, groupId, night.id);
      onCancelled();
    } catch (e) {
      setActionError(errorMessage(e, "failed to cancel night"));
      setBusy(false);
    }
  }, [apiUrl, groupId, night.id, busy, onCancelled]);

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
                value={draftDate}
                today={today}
                month={month}
                nightDates={nightDates}
                onPick={setDraftDate}
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
                {formatWeekdayDate(draftDate)}
              </Text>
              <Text style={styles.heroMeta} allowFontScaling={false}>
                {picker !== null
                  ? `${countdownLabel(draftDate, today)} · ${firstName(picker.name)} picks`
                  : countdownLabel(draftDate, today)}
              </Text>
            </View>
          </View>

          <SectionLabel>Night settings</SectionLabel>
          <View style={styles.card}>
            <View style={styles.divider}>
              <SettingsRow
                label="Date"
                value={formatShortDate(draftDate)}
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

          <SectionLabel>{`Who's coming · ${draftAttendees.size}`}</SectionLabel>
          <View>
            {coreMembers.map((m, i) => {
              const here = draftAttendees.has(m.id);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => toggleAttendee(m.id)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.attendRow,
                    i < coreMembers.length - 1 && styles.attendDivider,
                    !here && styles.dimmed,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Avatar name={m.name} size={40} />
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.name}
                  </Text>
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
  memberName: { ...textPresets.rowName, color: colors.text.primary, flex: 1 },
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
