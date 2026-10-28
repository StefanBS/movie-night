import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BellRing, Check, Clock, Moon, Sunrise } from "lucide-react-native";

import { AppButton, SectionLabel, Toggle, TopBar } from "../";
import { WizardFooter } from "./WizardFooter";
import { formatStartTime, startTimeMinus } from "../../lib/date";
import type { ReminderAudience, Reminders } from "../../lib/reminders";
import {
  borderWidth,
  colors,
  fontFamily,
  fontSize,
  pressedOpacity,
  radius,
  space,
  textPresets,
  trackPx,
} from "../../theme";

const AUDIENCES: { id: ReminderAudience; label: string; note: string }[] = [
  { id: "everyone", label: "Everyone coming", note: "The whole group" },
  { id: "picker", label: "Just the picker", note: "Only whoever picks" },
];

// RemindersView is the Edit screen's Reminders step (ADR-0010): when to remind
// and who gets nudged. It edits the Edit draft, so changes save with "Save
// changes" and are discarded with it. "2 hours before" needs a start time
// (ADR-0011), so without one it is shown disabled with a hint.
export function RemindersView({
  reminders,
  startTime,
  onChange,
  onDone,
}: {
  reminders: Reminders;
  startTime: string | null;
  onChange: (next: Reminders) => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.screen}>
      <TopBar kind="title" title="Reminders" back={{ label: "Edit", onPress: onDone }} />
      <View style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            A gentle nudge so nobody forgets — and the picker comes with a film in mind.
          </Text>

          <SectionLabel>When to remind</SectionLabel>
          <View style={styles.card}>
            <SlotRow
              icon={<Moon size={18} color={colors.text.secondary} />}
              label="The night before"
              time="6:00 PM"
              value={reminders.nightBefore}
              onChange={(nightBefore) => onChange({ ...reminders, nightBefore })}
              divider
            />
            <SlotRow
              icon={<Sunrise size={18} color={colors.text.secondary} />}
              label="Morning of"
              time="9:00 AM"
              value={reminders.morningOf}
              onChange={(morningOf) => onChange({ ...reminders, morningOf })}
              divider
            />
            <SlotRow
              icon={<Clock size={18} color={colors.text.secondary} />}
              label="2 hours before"
              time={
                startTime !== null
                  ? formatStartTime(startTimeMinus(startTime, 120))
                  : "Set a start time to get this reminder"
              }
              value={startTime !== null && reminders.twoHoursBefore}
              onChange={(twoHoursBefore) => onChange({ ...reminders, twoHoursBefore })}
              disabled={startTime === null}
            />
          </View>

          <SectionLabel>Who gets nudged</SectionLabel>
          <View style={styles.audienceRow}>
            {AUDIENCES.map((a) => {
              const selected = reminders.audience === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => onChange({ ...reminders, audience: a.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.audience,
                    selected && styles.audienceSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.audienceHead}>
                    <Text style={styles.audienceLabel}>{a.label}</Text>
                    {selected ? <Check size={16} color={colors.accent.strong} strokeWidth={2.5} /> : null}
                  </View>
                  <Text style={styles.audienceNote} allowFontScaling={false}>
                    {a.note}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.note}>
            <BellRing size={17} color={colors.accent.strong} />
            <Text style={styles.noteText}>
              The picker always gets a personal “it&apos;s your turn” nudge the night before, even if
              reminders are off for everyone else.
            </Text>
          </View>
        </ScrollView>
        <WizardFooter>
          <AppButton title="Done" fullWidth onPress={onDone} />
        </WizardFooter>
      </View>
    </View>
  );
}

function SlotRow({
  icon,
  label,
  time,
  value,
  onChange,
  divider = false,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  time: string;
  value: boolean;
  onChange: (next: boolean) => void;
  divider?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.slot, divider && styles.divider]}>
      {icon}
      <View style={styles.slotText}>
        <Text style={styles.slotLabel}>{label}</Text>
        <Text style={styles.slotTime} allowFontScaling={false}>
          {time}
        </Text>
      </View>
      <Toggle value={value} onChange={onChange} label={label} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[6] },
  intro: { ...textPresets.body, color: colors.text.secondary, marginTop: space[2] },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.border.hairline },
  slotText: { flex: 1 },
  slotLabel: { ...textPresets.body, color: colors.text.primary },
  slotTime: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.tertiary,
    letterSpacing: trackPx(fontSize.caption, "normal"),
    marginTop: space[1],
  },
  audienceRow: { flexDirection: "row", gap: space[3] },
  audience: {
    flex: 1,
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.surface.card,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  audienceSelected: {
    backgroundColor: colors.surface.spotlight,
    borderWidth: borderWidth.regular,
    borderColor: colors.accent.base,
  },
  pressed: { opacity: pressedOpacity },
  audienceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  audienceLabel: { ...textPresets.body, fontFamily: fontFamily.sansSemibold, color: colors.text.primary },
  audienceNote: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.caption,
    color: colors.text.secondary,
    marginTop: space[2],
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    marginTop: space[5],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.surface.subtle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border.hairline,
  },
  noteText: { ...textPresets.meta, color: colors.text.secondary, flex: 1 },
});
