// Sets output.later to the first day of next month, as the app labels it, so a
// flow can plan a night after today whatever day it runs. Always 1 to 31 days
// out, so it is never tonight and always one "Next month" tap away.
// Labels mirror lib/date.ts: `long` is formatWeekdayDate ("Tuesday, Dec 1",
// a Calendar day's accessibility label and the who step's heading), `when` is
// the Up next card's line (nightLine with the countdown label and long date).
// It runs on the host's clock, which is the phone's in practice; a run
// straddling midnight on a month's last day could disagree.
/* global output -- Maestro's runScript result object */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const later = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const days = Math.round((later.getTime() - today.getTime()) / 86400000);

const long = WEEKDAYS[later.getDay()] + ", " + SHORT_MONTHS[later.getMonth()] + " " + later.getDate();
const countdown = days === 1 ? "Tomorrow" : "In " + days + " days";

output.later = {
  long: long,
  month: MONTHS[later.getMonth()] + " " + later.getFullYear(),
  when: countdown + " · " + long,
};
