// A Night's reminder settings (ADR-0010), shared by the group: which slots are
// on and who they go to. The picker's personal nudge goes out the night before
// whatever these say.
export type ReminderAudience = "everyone" | "picker";

export type Reminders = {
  nightBefore: boolean;
  morningOf: boolean;
  audience: ReminderAudience;
};

// parseReminders validates an untrusted reminders payload, throwing a
// descriptive error if the shape is wrong.
export function parseReminders(raw: unknown): Reminders {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("reminders: expected an object");
  }
  const { nightBefore, morningOf, audience } = raw as Record<string, unknown>;
  if (typeof nightBefore !== "boolean") {
    throw new Error("reminders: nightBefore must be a boolean");
  }
  if (typeof morningOf !== "boolean") {
    throw new Error("reminders: morningOf must be a boolean");
  }
  if (audience !== "everyone" && audience !== "picker") {
    throw new Error('reminders: audience must be "everyone" or "picker"');
  }
  return { nightBefore, morningOf, audience };
}

export function sameReminders(a: Reminders, b: Reminders): boolean {
  return a.nightBefore === b.nightBefore && a.morningOf === b.morningOf && a.audience === b.audience;
}

// formatRemindersSummary is the Edit screen's one-line value for the
// Reminders row: which slots are on, or "Off". Pure.
export function formatRemindersSummary(r: Reminders): string {
  if (r.nightBefore && r.morningOf) {
    return "Night before, morning of";
  }
  if (r.nightBefore) {
    return "Night before";
  }
  if (r.morningOf) {
    return "Morning of";
  }
  return "Off";
}

// reminderConfirmation is the in-app message shown once changed reminder
// settings are saved, describing exactly what was chosen. Pure.
export function reminderConfirmation(r: Reminders): { title: string; body: string } {
  if (!r.nightBefore && !r.morningOf) {
    return { title: "Reminders off", body: "The picker still gets their nudge." };
  }
  const who = r.audience === "everyone" ? "everyone" : "just the picker";
  const when =
    r.nightBefore && r.morningOf
      ? "the night before and the morning of"
      : r.nightBefore
        ? "the night before"
        : "the morning of";
  return { title: "Reminder set", body: `We'll nudge ${who} ${when}.` };
}
