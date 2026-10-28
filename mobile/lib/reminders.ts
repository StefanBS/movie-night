// A Night's reminder settings (ADR-0010), shared by the group: which slots are
// on and who they go to. The picker's personal nudge goes out the night before
// whatever these say. twoHoursBefore only fires on a Night with a start time
// (ADR-0011).
export type ReminderAudience = "everyone" | "picker";

export type Reminders = {
  nightBefore: boolean;
  morningOf: boolean;
  twoHoursBefore: boolean;
  audience: ReminderAudience;
};

// parseReminders validates an untrusted reminders payload, throwing a
// descriptive error if the shape is wrong.
export function parseReminders(raw: unknown): Reminders {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("reminders: expected an object");
  }
  const { nightBefore, morningOf, twoHoursBefore, audience } = raw as Record<string, unknown>;
  if (typeof nightBefore !== "boolean") {
    throw new Error("reminders: nightBefore must be a boolean");
  }
  if (typeof morningOf !== "boolean") {
    throw new Error("reminders: morningOf must be a boolean");
  }
  if (typeof twoHoursBefore !== "boolean") {
    throw new Error("reminders: twoHoursBefore must be a boolean");
  }
  if (audience !== "everyone" && audience !== "picker") {
    throw new Error('reminders: audience must be "everyone" or "picker"');
  }
  return { nightBefore, morningOf, twoHoursBefore, audience };
}

export function sameReminders(a: Reminders, b: Reminders): boolean {
  return (
    a.nightBefore === b.nightBefore &&
    a.morningOf === b.morningOf &&
    a.twoHoursBefore === b.twoHoursBefore &&
    a.audience === b.audience
  );
}

// activeSlots names the slots that will actually fire, in send order: 2 hours
// before only counts when the Night has a start time. Pure.
function activeSlots(r: Reminders, startTime: string | null): string[] {
  const slots: string[] = [];
  if (r.nightBefore) {
    slots.push("the night before");
  }
  if (r.morningOf) {
    slots.push("the morning of");
  }
  if (r.twoHoursBefore && startTime !== null) {
    slots.push("2 hours before");
  }
  return slots;
}

// formatRemindersSummary is the Edit screen's one-line value for the
// Reminders row: which slots are on, or "Off". Pure.
export function formatRemindersSummary(r: Reminders, startTime: string | null): string {
  const slots = activeSlots(r, startTime).map((s) => s.replace(/^the /, ""));
  if (slots.length === 0) {
    return "Off";
  }
  const text = slots.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

// reminderConfirmation is the in-app message shown once changed reminder
// settings are saved, describing exactly what was chosen. Pure.
export function reminderConfirmation(r: Reminders, startTime: string | null): { title: string; body: string } {
  const slots = activeSlots(r, startTime);
  if (slots.length === 0) {
    return { title: "Reminders off", body: "The picker still gets their nudge." };
  }
  const who = r.audience === "everyone" ? "everyone" : "just the picker";
  const when = slots.length === 1 ? slots[0] : `${slots.slice(0, -1).join(", ")} and ${slots[slots.length - 1]}`;
  return { title: "Reminder set", body: `We'll nudge ${who} ${when}.` };
}
