import { errorMessage } from "./errors";
import type { Member } from "./members";
import { deleteNight, updateNight, type Night } from "./nights";
import { sameReminders, type Reminders } from "./reminders";
import { createSessionCore, type Session } from "./session";

// The Edit screen's module for a saved Night: a draft of its date, attendees
// and reminder settings, saved in one request that either fully applies or changes nothing,
// and cancelling the Night. The picker is always an attendee (ADR-0008), so the
// draft never drops them — change the picker from the Night first. Writes are
// one at a time: while one runs (busy), the others return without a request.

// EditRow is one person the Edit screen lists under "Who's coming".
export type EditRow = { id: string; name: string };

export type NightEditState = {
  night: Night;
  members: Member[];
  date: string;
  attendees: ReadonlySet<string>;
  reminders: Reminders;
  rows: EditRow[];
  dirty: boolean;
  busy: "save" | "cancel" | null;
  actionError: string | null;
};

export type NightEdit = Session<NightEditState> & {
  setDate(date: string): void;
  toggle(memberId: string): void;
  setReminders(reminders: Reminders): void;
  // save returns the saved Night, or null when nothing was sent or it failed.
  save(): Promise<Night | null>;
  // cancelNight deletes the Night; true once it's gone.
  cancelNight(): Promise<boolean>;
};

// editRows lists who the Edit screen can mark in or out: the active core
// members, then every other attendee of the Night (guests, inactive members)
// so they can be seen and removed. Pure.
export function editRows(night: Night, members: Member[]): EditRow[] {
  const rows: EditRow[] = members
    .filter((m) => m.status === "active" && m.role === "core")
    .map((m) => ({ id: m.id, name: m.name }));
  const listed = new Set(rows.map((r) => r.id));
  for (const a of night.attendees) {
    if (!listed.has(a.id)) {
      rows.push({ id: a.id, name: a.name });
    }
  }
  return rows;
}

type Draft = Pick<NightEditState, "date" | "attendees" | "reminders">;

function isDirty(night: Night, { date, attendees, reminders }: Draft): boolean {
  return (
    date !== night.scheduledFor ||
    !sameReminders(reminders, night.reminders) ||
    attendees.size !== night.attendees.length ||
    night.attendees.some((a) => !attendees.has(a.id))
  );
}

// fromNight is the draft a stored Night opens with (and resets to once saved).
function fromNight(night: Night, members: Member[]) {
  return {
    night,
    date: night.scheduledFor,
    attendees: new Set(night.attendees.map((a) => a.id)),
    reminders: night.reminders,
    rows: editRows(night, members),
    dirty: false,
  };
}

export function createNightEdit({
  baseUrl,
  groupId,
  night,
  members,
}: {
  baseUrl: string;
  groupId: string;
  night: Night;
  members: Member[];
}): NightEdit {
  const core = createSessionCore<NightEditState>({
    ...fromNight(night, members),
    members,
    busy: null,
    actionError: null,
  });

  const setDraft = (change: Partial<Draft>) => {
    const { date, attendees, reminders } = core.state;
    const draft = { date, attendees, reminders, ...change };
    core.set({ ...draft, dirty: isDirty(core.state.night, draft) });
  };

  const nightId = night.id;

  return {
    get state() {
      return core.state;
    },
    subscribe: core.subscribe,
    dispose: core.dispose,

    setDate(date) {
      setDraft({ date });
    },

    toggle(memberId) {
      if (memberId === core.state.night.pickerId) {
        return;
      }
      const next = new Set(core.state.attendees);
      if (!next.delete(memberId)) {
        next.add(memberId);
      }
      setDraft({ attendees: next });
    },

    setReminders(reminders) {
      setDraft({ reminders });
    },

    async save() {
      const { busy, dirty, date, attendees, reminders } = core.state;
      if (busy !== null || !dirty) {
        return null;
      }
      core.set({ busy: "save", actionError: null });
      try {
        const saved = await core.track((signal) =>
          updateNight(baseUrl, groupId, nightId, { scheduledFor: date, attendees: [...attendees], reminders }, signal),
        );
        core.set({ ...fromNight(saved, core.state.members), busy: null });
        return saved;
      } catch (e) {
        core.set({ busy: null, actionError: errorMessage(e, "failed to save changes") });
        return null;
      }
    },

    async cancelNight() {
      if (core.state.busy !== null) {
        return false;
      }
      core.set({ busy: "cancel", actionError: null });
      try {
        await core.track((signal) => deleteNight(baseUrl, groupId, nightId, signal));
        core.set({ busy: null });
        return true;
      } catch (e) {
        core.set({ busy: null, actionError: errorMessage(e, "failed to cancel night") });
        return false;
      }
    },
  };
}
