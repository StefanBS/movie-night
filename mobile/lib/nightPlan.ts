import { errorMessage } from "./errors";
import { fetchGroupName } from "./group";
import { fetchMembers, type Member } from "./members";
import { createPicking } from "./nightDraft";
import { nightDates } from "./nightLifecycle";
import { createNight, listNights, type Night } from "./nights";
import { createSessionCore, type Session } from "./session";
import { fetchTurn, type TurnMember } from "./turn";

// The Plan module behind the New night screen (GLOSSARY: Plan). A Plan is a
// Night being arranged — date and start time, then who's coming — that exists only here until
// create() saves it whole with its picker (ADR-0008). It owns the When → Who
// step, the live turn order over the attendees, and who picks.

export type PlanStep = "when" | "who";

export type NightPlanState = {
  loading: boolean;
  error: string | null;
  members: Member[];
  nightDates: Set<string>;
  // groupName titles the saved Night's calendar entry; null if it failed.
  groupName: string | null;
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
  // load fetches the roster, the club's turn ranking, its name and the dates
  // that already hold a Night.
  load(): Promise<void>;
  // chooseDate sets the date and HH:MM start time (or none) and moves on to Who.
  chooseDate(iso: string, startTime: string | null): void;
  back(): void;
  // toggle adds or removes an attendee and reranks them.
  toggle(memberId: string): void;
  // choosePicker overrides the order until that person stops attending.
  choosePicker(memberId: string): void;
  // create saves the Plan as a Night, or returns null (no picker, already
  // creating, or the backend refused — see actionError).
  create(): Promise<Night | null>;
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
    groupName: null,
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

  return {
    get state() {
      return core.state;
    },
    subscribe: core.subscribe,
    dispose: core.dispose,

    async load() {
      core.set({ loading: true, error: null });
      try {
        const [members, ranking, groupName, nights] = await core.track((signal) =>
          Promise.all([
            fetchMembers(baseUrl, groupId, signal),
            fetchTurn(baseUrl, groupId, signal),
            fetchGroupName(baseUrl, groupId, signal),
            // The dots are a hint; a failure here must not block planning.
            listNights(baseUrl, groupId, signal).catch(() => [] as Night[]),
          ]),
        );
        core.set({ members, groupName, nightDates: nightDates(nights), loading: false });
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

    async create() {
      const { busy, pickerId, date, startTime, attendeeIds } = core.state;
      if (busy !== null || pickerId === null) {
        return null;
      }
      core.set({ busy: "create", actionError: null });
      try {
        const night = await core.track((signal) =>
          createNight(baseUrl, groupId, { scheduledFor: date, startTime, attendees: [...attendeeIds], pickerId }, signal),
        );
        core.set({ busy: null });
        return night;
      } catch (e) {
        core.set({ busy: null, actionError: errorMessage(e, "failed to create night") });
        return null;
      }
    },
  };
}
