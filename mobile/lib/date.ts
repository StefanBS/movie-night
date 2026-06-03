// todayLocalISO returns the given date (default: now) as a device-local
// YYYY-MM-DD string — the "tonight" a phone user means, independent of the
// server clock or UTC. The optional `now` argument keeps it pure and testable.
export function todayLocalISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
