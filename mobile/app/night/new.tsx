import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { TopBar } from "../../components";
import { WhenStep, WhoStep, ExistingNightEditor } from "../../components/night";
import { API_URL } from "../../apiUrl";
import { GROUP_ID } from "../../lib/api";
import { todayLocalISO } from "../../lib/date";
import { errorMessage } from "../../lib/errors";
import { fetchMembers, type Member } from "../../lib/members";
import { createNight, listNights, type Night } from "../../lib/nights";
import { draftPicker } from "../../lib/nightDraft";
import { nightDates } from "../../lib/nightLifecycle";
import { fetchTurnAmong, type TurnMember } from "../../lib/turn";
import {
  colors,
  textPresets,
  space,
} from "../../theme";

// NightScreen plans a new Night: When → Who as a client-side draft, then one
// create with the date, attendees and picker (ADR-0008). Nothing is saved until
// "Next", so backing out leaves nothing behind. Once created, the Night opens
// on its film step.
export default function NightScreen() {
  const router = useRouter();
  const today = todayLocalISO();
  const [members, setMembers] = useState<Member[]>([]);
  const [nightDatesSet, setNightDatesSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<"when" | "who">("when");
  const [date, setDate] = useState(today);
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set());
  const [chosenPicker, setChosenPicker] = useState<string | null>(null);
  const [order, setOrder] = useState<TurnMember[]>([]);
  const [created, setCreated] = useState<Night | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [roster, allNights] = await Promise.all([
          fetchMembers(API_URL, GROUP_ID, controller.signal),
          listNights(API_URL, GROUP_ID, controller.signal).catch(() => [] as Night[]),
        ]);
        setMembers(roster);
        setNightDatesSet(nightDates(allNights));
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(errorMessage(e, "failed to load the club"));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  // The live order over the draft's attendees; re-ranked on every toggle, with
  // the previous request cancelled so a slow response can't overwrite a newer one.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setOrder(await fetchTurnAmong(API_URL, GROUP_ID, [...attendeeIds], controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) {
          setActionError(errorMessage(e, "failed to load pick order"));
        }
      }
    })();
    return () => controller.abort();
  }, [attendeeIds]);

  const pickerId = draftPicker(order, attendeeIds, chosenPicker);

  const onToggle = useCallback((member: Member) => {
    setAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(member.id)) {
        next.delete(member.id);
      } else {
        next.add(member.id);
      }
      return next;
    });
    // Removing the chosen picker hands the pick back to the order.
    setChosenPicker((chosen) => (chosen === member.id ? null : chosen));
  }, []);

  const onCreate = useCallback(async () => {
    if (busy !== null || pickerId === null) {
      return;
    }
    setBusy("create");
    setActionError(null);
    try {
      setCreated(
        await createNight(API_URL, GROUP_ID, {
          scheduledFor: date,
          attendees: [...attendeeIds],
          pickerId,
        }),
      );
    } catch (e) {
      setActionError(errorMessage(e, "failed to create night"));
    } finally {
      setBusy(null);
    }
  }, [busy, pickerId, date, attendeeIds]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={styles.center} size="large" color={colors.accent.base} />
      </View>
    );
  }
  if (error !== null) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.center, styles.error]}>{`Couldn't load the club: ${error}`}</Text>
      </View>
    );
  }

  if (created !== null) {
    return (
      <ExistingNightEditor
        key={created.id}
        night={created}
        members={members}
        today={today}
        initialStep="pick"
        onDone={() => router.back()}
        onCancel={() => router.back()}
        onEdit={() =>
          router.push({ pathname: "/night/edit/[id]", params: { id: created.id } })
        }
      />
    );
  }

  const banner =
    actionError !== null ? (
      <Text style={[styles.banner, styles.error]}>{actionError}</Text>
    ) : null;

  if (step === "who") {
    return (
      <View style={styles.screen}>
        <TopBar
          kind="title"
          title="New night"
          back={{ label: "When", onPress: () => setStep("when") }}
        />
        {banner}
        <WhoStep
          scheduledFor={date}
          today={today}
          members={members}
          attendeeIds={attendeeIds}
          pickerId={pickerId}
          busy={busy}
          onToggle={onToggle}
          onChoosePicker={setChosenPicker}
          onNext={onCreate}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar
        kind="title"
        title="New night"
        back={{ label: "Cancel", onPress: () => router.back() }}
      />
      {banner}
      <WhenStep
        today={today}
        initial={date}
        nightDates={nightDatesSet}
        busy={busy}
        onNext={(iso) => {
          setDate(iso);
          setActionError(null);
          setStep("who");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  center: { marginTop: space[8], textAlign: "center" },
  error: { ...textPresets.body, color: colors.text.danger },
  banner: { paddingVertical: space[2], paddingHorizontal: space[5], textAlign: "center" },
});
