import { errorMessage } from "./errors";
import { fetchMembers, type Member } from "./members";
import { createPicking, draftPicker, rankAmong } from "./nightDraft";
import { nightDates } from "./nightLifecycle";
import { createNight, listNights, updateNight, type Night } from "./nights";
import { createSessionCore, withSession, type Session } from "./session";
import { fetchTurn, type TurnMember } from "./turn";

// The Plan module behind the New night screen (GLOSSARY: Plan). A Plan is a
// Night being arranged — date and start time, then who's coming — that exists only here until
// save() creates it whole with its picker (ADR-0008). It owns the When → Who
// step, the live turn order over the attendees, and who picks. Backing out of
// the film step reopens the saved Night here, so the wizard's earlier steps
// edit it: the next save() updates that Night rather than creating another.

export type PlanStep = "when" | "who";

export type NightPlanState = {
  loading: boolean;
  error: string | null;
  members: Member[];
  nightDates: Set<string>;
  step: PlanStep;
  date: string;
  startTime: string | null;
  attendeeIds: ReadonlySet<string>;
  order: TurnMember[];
  pickerId: string | null;
  busy: string | null;
  actionError: string | null;
};

export type NightPlan = Session<NightPlanState> & {
  // load fetches the roster, the club's turn ranking and the dates that
  // already hold a Night.
  load(): Promise<void>;
  // chooseDate sets the date and HH:MM start time (or none) and moves on to Who.
  chooseDate(iso: string, startTime: string | null): void;
  back(): void;
  // toggle adds or removes an attendee and reranks them.
  toggle(memberId: string): void;
  // choosePicker overrides the order until that person stops attending.
  choosePicker(memberId: string): void;
  // reopen returns to Who with a Night this Plan saved, as it now stands
  // (its picker may have changed on the film step), so the next save()
  // updates it.
  reopen(night: Night): void;
  // save creates the Plan as a Night, or updates the Night it reopened (no
  // request when nothing changed). It returns null when there's no picker, a
  // save is already running, or the backend refused — see actionError.
  save(): Promise<Night | null>;
};

export function createNightPlan({
  baseUrl,
  groupId,
  today,
}: {
  baseUrl: string;
  groupId: string;
  today: string;
}): NightPlan {
  const core = createSessionCore<NightPlanState>({
    loading: true,
    error: null,
    members: [],
    nightDates: new Set(),
    step: "when",
    date: today,
    startTime: null,
    attendeeIds: new Set(),
    order: [],
    pickerId: null,
    busy: null,
    actionError: null,
  });
  const picking = createPicking(core);
  // ranking is the club's full turn ranking, as load fetched it.
  let ranking: TurnMember[] = [];
  // saved is the Night this Plan saved and reopened, or null before then.
  let saved: Night | null = null;

  return withSession<NightPlan>(core, {
    async load() {
      core.set({ loading: true, error: null });
      try {
        const [members, turn, nights] = await core.track((signal) =>
          Promise.all([
            fetchMembers(baseUrl, groupId, signal),
            fetchTurn(baseUrl, groupId, signal),
            // The dots are a hint; a failure here must not block planning.
            listNights(baseUrl, groupId, signal).catch(() => [] as Night[]),
          ]),
        );
        core.set({ members, nightDates: nightDates(nights), loading: false });
        ranking = turn;
        picking.reset(new Set(), ranking, null);
      } catch (e) {
        core.set({ error: errorMessage(e, "failed to load the club"), loading: false });
      }
    },

    chooseDate(iso, startTime) {
      core.set({ date: iso, startTime, step: "who", actionError: null });
    },

    back() {
      core.set({ step: "when" });
    },

    toggle: picking.toggle,
    choosePicker: picking.choosePicker,

    reopen(night) {
      saved = night;
      const attendeeIds = new Set(night.attendees.map((a) => a.id));
      // A picker who heads the order over these attendees is the order's, so
      // toggling still reranks; anyone else was chosen, and holds.
      const order = rankAmong(ranking, attendeeIds);
      const chosen = draftPicker(order, attendeeIds, null) === night.pickerId ? null : night.pickerId;
      core.set({ step: "who", date: night.scheduledFor, startTime: night.startTime, actionError: null });
      picking.reset(attendeeIds, ranking, chosen);
    },

    async save() {
      const { pickerId, date, startTime, attendeeIds } = core.state;
      if (pickerId === null) {
        return null;
      }
      const attendees = [...attendeeIds];
      const night = saved;
      if (night === null) {
        return core.act("save", "failed to create night", (signal) =>
          createNight(baseUrl, groupId, { scheduledFor: date, startTime, attendees, pickerId }, signal),
        );
      }
      if (core.state.busy !== null) {
        return null;
      }
      if (unchanged(night, { date, startTime, attendeeIds, pickerId })) {
        return night;
      }
      const updated = await core.act("save", "failed to save night", (signal) =>
        updateNight(
          baseUrl,
          groupId,
          night.id,
          { scheduledFor: date, startTime, attendees, reminders: night.reminders, repeat: night.repeat, pickerId },
          signal,
        ),
      );
      if (updated !== null) {
        saved = updated;
      }
      return updated;
    },
  });
}

// unchanged reports whether the Plan still says what its saved Night does, so
// saving again needs no request. Pure.
function unchanged(
  night: Night,
  plan: { date: string; startTime: string | null; attendeeIds: ReadonlySet<string>; pickerId: string },
): boolean {
  return (
    night.scheduledFor === plan.date &&
    night.startTime === plan.startTime &&
    night.pickerId === plan.pickerId &&
    night.attendees.length === plan.attendeeIds.size &&
    night.attendees.every((a) => plan.attendeeIds.has(a.id))
  );
}
