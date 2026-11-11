// Sets output.later to the first day of next month, so a flow can plan a night
// after today whatever day it runs. Always 1 to 31 days out, so it is never
// tonight and always one "Next month" tap away.
// It gives only dates (`iso` "2026-12-01", `month` "2026-12") for the testIDs
// the Calendar, who step and Up next card carry; the labels the app shows are
// lib/date.ts's to format and its unit tests' to check, never rebuilt here.
// It runs on the host's clock, which is the phone's in practice; a run
// straddling midnight on a month's last day could disagree.
/* global output -- Maestro's runScript result object */
const now = new Date();
const later = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const month = later.getFullYear() + "-" + String(later.getMonth() + 1).padStart(2, "0");

output.later = {
  iso: month + "-01",
  month: month,
};
