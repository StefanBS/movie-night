// Resets the dev DB through the backend's dev-only POST /dev/reseed
// (backend/devreset.go), so every flow starts from the same data. launch.yaml
// runs it first; `just e2e` passes RESEED_URL and the backend must run with
// DEV_RESET=1. It runs on this machine, not the phone.
// FIXTURE (optional) adds backend/fixtures/<FIXTURE>.sql on top of the seed,
// with this machine's local date as its "tonight" (the database's date is
// UTC). CLAIMED=1 keeps the phone claimed, as Ada; otherwise the reseed
// revokes its token.
/* global http, RESEED_URL, FIXTURE, CLAIMED -- Maestro's runScript HTTP client and env */
const pad = (n) => (n < 10 ? "0" : "") + n;
const now = new Date();
const today = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
const params = ["today=" + today];
if (typeof FIXTURE !== "undefined" && FIXTURE !== "") params.push("fixture=" + encodeURIComponent(FIXTURE));
if (typeof CLAIMED !== "undefined" && CLAIMED === "1") params.push("claimed=1");
const url = RESEED_URL + "?" + params.join("&");
const response = http.post(url, { body: "" });
if (response.status !== 204) {
  throw new Error("reseed: POST " + url + " answered " + response.status + " " + response.body);
}
