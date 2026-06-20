import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton, Avatar, Badge, SectionLabel } from "../";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { formatShortDate } from "../../lib/date";
import type { Member } from "../../lib/members";
import type { Night } from "../../lib/nights";
import type { TurnMember } from "../../lib/turn";
import { borderWidth, colors, pressedOpacity, radius, shadow, space, textPresets } from "../../theme";

function firstNameOf(name: string): string {
  return name.split(" ")[0];
}

// WhoStep — attendance toggles for the full roster. The next-up present core
// member (order[0]) is spotlighted as the picker; the footer records the pick
// and advances.
export function WhoStep({
  night,
  members,
  order,
  attendeeIds,
  busy,
  onToggle,
  onNext,
}: {
  night: Night;
  members: Member[];
  order: TurnMember[];
  attendeeIds: Set<string>;
  busy: string | null;
  onToggle: (m: Member) => void;
  onNext: () => void;
}) {
  const picker = order[0] ?? null;
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stepper current={1} />
        <Text style={styles.heading}>{`Night of ${formatShortDate(night.scheduledFor)}`}</Text>
        <Text style={styles.hint}>
          {"Tap who made it. Tonight's pick goes to whoever's next up and here."}
        </Text>

        <SectionLabel>{"Who's here?"}</SectionLabel>
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
          title={picker ? `Next — ${firstNameOf(picker.name)} picks  →` : "Add who's here  →"}
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
  heading: {
    ...textPresets.screenTitle,
    color: colors.text.primary,
    marginTop: space[4],
  },
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
  tag: { ...textPresets.tag, color: colors.text.secondary },
});
