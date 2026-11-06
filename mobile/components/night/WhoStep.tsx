import { Pressable, ScrollView, Text, View } from "react-native";

import { AppButton, Badge, MemberRow, SectionLabel } from "../";
import { AttendCheck } from "./AttendCheck";
import { Stepper } from "./Stepper";
import { WizardFooter } from "./WizardFooter";
import { firstName } from "../../lib/avatar";
import { formatWeekdayDate, relativeLabel } from "../../lib/date";
import type { Member } from "../../lib/members";
import { nightWording } from "../../lib/nightLifecycle";
import { createThemedStyles, fontFamily, space, textPresets } from "../../theme";

// WhoStep — attendance toggles for the full roster, for a plan that is not yet
// a Night (ADR-0008). The picker (pickerId — next up among those in, unless the
// user chose someone) is spotlighted; any other attendee can be made picker,
// which is how a guest-only night gets one. The footer creates the Night. The
// "We watched it" flow reuses it for a saved Night: pre-filled attendeeIds, no
// Stepper (it isn't the New night wizard), and its own nextLabel.
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
  stepper = true,
  nextLabel = (first) => `Next: ${first} picks →`,
}: {
  scheduledFor: string;
  today: string;
  members: Member[];
  attendeeIds: ReadonlySet<string>;
  pickerId: string | null;
  busy: string | null;
  onToggle: (m: Member) => void;
  onChoosePicker: (memberId: string) => void;
  onNext: () => void;
  stepper?: boolean;
  // nextLabel is the footer button's label once someone gets the pick.
  nextLabel?: (first: string) => string;
}) {
  const styles = useStyles();
  const wording = nightWording(scheduledFor, today);
  const picker = members.find((m) => m.id === pickerId) ?? null;
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        {stepper ? <Stepper current={1} /> : null}
        <View style={styles.headingRow}>
          <Text style={styles.heading} numberOfLines={1}>
            {formatWeekdayDate(scheduledFor)}
          </Text>
          <Badge label={relativeLabel(scheduledFor, today)} tone="neutral" />
        </View>
        <Text style={styles.hint}>
          {wording.whoHint}
        </Text>

        <SectionLabel>{wording.whoSection}</SectionLabel>
        {members.map((m, i) => {
          const here = attendeeIds.has(m.id);
          const isPicker = picker?.id === m.id;
          return (
            <MemberRow
              key={m.id}
              name={m.name}
              meta={isPicker ? "Gets the pick" : undefined}
              metaTone="accent"
              highlighted={isPicker}
              dimmed={!here}
              divider={i < members.length - 1}
              onPress={() => onToggle(m)}
              disabled={busy !== null}
              right={
                <View style={styles.trailing}>
                  {here && !isPicker ? (
                    <Pressable
                      onPress={() => onChoosePicker(m.id)}
                      disabled={busy !== null}
                      hitSlop={space[2]}
                      accessibilityLabel={`Make ${m.name} the picker`}
                    >
                      <Text style={styles.makePicker}>Make picker</Text>
                    </Pressable>
                  ) : null}
                  {busy === m.id ? <Text style={styles.tag}>…</Text> : <AttendCheck on={here} />}
                </View>
              }
            />
          );
        })}
      </ScrollView>
      <WizardFooter>
        <AppButton
          title={
            picker
              ? nextLabel(firstName(picker.name))
              : attendeeIds.size > 0
                ? "Choose who picks →"
                : "Add who's here →"
          }
          fullWidth
          disabled={busy !== null || picker === null}
          onPress={onNext}
        />
      </WizardFooter>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
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
  trailing: { flexDirection: "row", alignItems: "center", gap: space[3] },
  makePicker: { ...textPresets.meta, fontFamily: fontFamily.sansSemibold, fontSize: 13, color: colors.text.link },
  tag: { ...textPresets.tag, color: colors.text.secondary },
}));
