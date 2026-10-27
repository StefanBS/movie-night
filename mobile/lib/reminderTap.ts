// A reminder push carries the Night it is about as data.nightId (ADR-0010).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// reminderNightId reads the Night id from a notification's data, or null when
// it isn't a reminder. Only a well-formed UUID is returned, since it becomes
// part of a route. Pure.
export function reminderNightId(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const { nightId } = data as Record<string, unknown>;
  return typeof nightId === "string" && UUID.test(nightId) ? nightId : null;
}
