// Resets the dev DB to exactly the seed through the backend's dev-only
// POST /dev/reseed (backend/devreset.go), so every flow starts from the same
// data. open.yaml runs it first; `just e2e` passes RESEED_URL and the backend
// must run with DEV_RESET=1. It runs on this machine, not the phone.
/* global http, RESEED_URL -- Maestro's runScript HTTP client and env */
const response = http.post(RESEED_URL, { body: "" });
if (response.status !== 204) {
  throw new Error("reseed: POST " + RESEED_URL + " answered " + response.status + " " + response.body);
}
