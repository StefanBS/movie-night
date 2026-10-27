import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Avatar, Badge, SectionLabel } from "../";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { firstName } from "../../lib/avatar";
import { formatWeekdayDate, relativeLabel } from "../../lib/date";
import type { Member } from "../../lib/members";
import { nightTiming } from "../../lib/nightLifecycle";
import { borderWidth, colors, pressedOpacity, radius, shadow, space, textPresets } from "../../theme";

// WhoStep — attendance toggles for the full roster, for a plan that is not yet
// a Night (ADR-0008). The picker (pickerId — next up among those in, unless the
// user chose someone) is spotlighted; any other attendee can be made picker,
// which is how a guest-only night gets one. The footer creates the Night.
export function WhoStep({
  scheduledFor,
  today,
  members,
  attendeeIds,
  pickerId,
  busy,
  onToggle,
  onChoosePicker,
  onNext,
}: {
  scheduledFor: string;
  today: string;
  members: Member[];
  attendeeIds: Set<string>;
  pickerId: string | null;
  busy: string | null;
  onToggle: (m: Member) => void;
  onChoosePicker: (memberId: string) => void;
  onNext: () => void;
}) {
  const future = nightTiming(scheduledFor, today) === "upcoming";
  const picker = members.find((m) => m.id === pickerId) ?? null;
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stepper current={1} />
        <View style={styles.headingRow}>
          <Text style={styles.heading} numberOfLines={1}>
            {formatWeekdayDate(scheduledFor)}
          </Text>
          <Badge label={relativeLabel(scheduledFor, today)} uppercase={false} />
        </View>
        <Text style={styles.hint}>
          {future ? "Who's planning to come? The next-up member who's in gets the pick." : "Tap who made it. Tonight's pick goes to whoever's next up and here."}
        </Text>

        <SectionLabel>{future ? "Who's coming?" : "Who's here?"}</SectionLabel>
        {members.map((m) => {
          const here = attendeeIds.has(m.id);
          const isPicker = picker?.id === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => onToggle(m)}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.attendRow,
                isPicker ? styles.pickerRow : styles.attendDivider,
                !here && styles.dimmed,
                pressed && styles.rowPressed,
              ]}
            >
              <Avatar name={m.name} size={40} glow={isPicker} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                </Text>
                {isPicker ? <Text style={styles.getsPick}>GETS THE PICK</Text> : null}
              </View>
              {here && !isPicker ? (
                <Pressable
                  onPress={() => onChoosePicker(m.id)}
                  disabled={busy !== null}
                  hitSlop={space[2]}
                  accessibilityLabel={`Make ${m.name} the picker`}
                >
                  <Text style={styles.makePicker}>MAKE PICKER</Text>
                </Pressable>
              ) : null}
              {busy === m.id ? (
                <Text style={styles.tag}>…</Text>
              ) : here ? (
                <Badge label="✓ In" tone="solid" uppercase={false} />
              ) : (
                <Text style={styles.outTag}>OUT</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <WizardFooter>
        <AppButton
          title={
            picker
              ? `Next — ${firstName(picker.name)} picks  →`
              : attendeeIds.size > 0
                ? "Choose who picks  →"
                : "Add who's here  →"
          }
          fullWidth
          disabled={busy !== null || picker === null}
          onPress={onNext}
        />
      </WizardFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    paddingBottom: space[6],
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    marginTop: space[4],
  },
  heading: { ...textPresets.screenTitle, color: colors.text.primary, flexShrink: 1 },
  hint: { ...textPresets.meta, color: colors.text.secondary },
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
  pickerRow: {
    backgroundColor: colors.surface.spotlight,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.accent.base,
    ...shadow.spotlight,
  },
  dimmed: { opacity: 0.5 },
  rowPressed: { opacity: pressedOpacity },
  rowText: { flex: 1 },
  name: { ...textPresets.rowName, color: colors.text.primary },
  getsPick: { ...textPresets.tag, color: colors.accent.strong, marginTop: space[1] },
  outTag: { ...textPresets.tag, color: colors.text.tertiary },
  makePicker: { ...textPresets.tag, color: colors.accent.cool },
  tag: { ...textPresets.tag, color: colors.text.secondary },
});
