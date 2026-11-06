import { firstName } from "./avatar";
import { nightPicker, type Night } from "./nights";

// What a row in Tonight's "Also planned" says under its date (the date is
// nightLine's). Pure, so the screen only lays it out.

// alsoPlannedPicks is a row's line under the date ("Priya picks").
export function alsoPlannedPicks(night: Night): string {
  return `${firstName(nightPicker(night).name)} picks`;
}
