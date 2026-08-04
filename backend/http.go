package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// This file holds the plumbing shared across every handler family: path
// parsing, the JSON response/error contract, the store-error-to-status mapping,
// and the wire date format. Keeping it in one place means "how does this service
// parse paths, render dates and emit errors" is findable without opening a
// feature handler.

// parseUUID validates an already-extracted string as a UUID. On a malformed
// value it writes a 400 with errMsg and returns ok=false (the handler should
// then return). This is the single primitive that maps a bad id to a 400; both
// pathUUID (path segments) and handlers parsing a JSON body field build on it.
func parseUUID(w http.ResponseWriter, raw, errMsg string) (uuid.UUID, bool) {
	id, err := uuid.Parse(raw)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, errMsg)
		return uuid.UUID{}, false
	}
	return id, true
}

// pathUUID parses the named path segment as a UUID, delegating the parse-and-400
// to parseUUID. Routes with two ids (group + user/night) call it once per segment.
func pathUUID(w http.ResponseWriter, r *http.Request, segment, errMsg string) (uuid.UUID, bool) {
	return parseUUID(w, r.PathValue(segment), errMsg)
}

// pathGroupNight parses the {groupId}/{nightId} pair that every night-scoped
// route carries, so the two-segment preamble is written once instead of in each
// of the nine handlers. ok=false means a 400 was already written.
func pathGroupNight(w http.ResponseWriter, r *http.Request) (gid, nightID uuid.UUID, ok bool) {
	if gid, ok = pathUUID(w, r, "groupId", "invalid group id"); !ok {
		return uuid.UUID{}, uuid.UUID{}, false
	}
	if nightID, ok = pathUUID(w, r, "nightId", "invalid night id"); !ok {
		return uuid.UUID{}, uuid.UUID{}, false
	}
	return gid, nightID, true
}

// pathGroupUser is pathGroupNight's twin for the {groupId}/{userId} routes.
func pathGroupUser(w http.ResponseWriter, r *http.Request) (gid, uid uuid.UUID, ok bool) {
	if gid, ok = pathUUID(w, r, "groupId", "invalid group id"); !ok {
		return uuid.UUID{}, uuid.UUID{}, false
	}
	if uid, ok = pathUUID(w, r, "userId", "invalid user id"); !ok {
		return uuid.UUID{}, uuid.UUID{}, false
	}
	return gid, uid, true
}

// writeJSONError writes a JSON error body with a matching Content-Type, so every
// response this service emits — success and error alike — is application/json.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// respondJSON writes v as a JSON success body with the matching Content-Type and
// status — the success-path twin of writeJSONError, so the header/encode/log
// dance lives in one place rather than in every handler. An encode failure is
// only logged: the status line is already on the wire, so there's nothing to
// recover. gid scopes the log line; see logScope for the group-less routes.
func respondJSON(w http.ResponseWriter, status int, v any, gid uuid.UUID, what string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("%s (%s): %v", what, logScope(gid), err) //#nosec G706 -- gid is a parsed uuid.UUID
	}
}

// decodeJSON decodes the request body into a T, writing a 400 and returning
// ok=false on malformed JSON (the handler should then return). It is the body
// counterpart to pathUUID/parseUUID's "parse-or-400-and-signal-stop" contract,
// and the single place a bad body maps to a 400 — so size limits or strict
// field checks can later be added here once, not per handler.
func decodeJSON[T any](w http.ResponseWriter, r *http.Request) (T, bool) {
	var v T
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return v, false
	}
	return v, true
}

// logScope renders the group id that scopes a log line. uuid.Nil means the route
// has no group (/healthz, /movies/search) and renders as "-", so those handlers
// use the shared response helpers rather than hand-rolling the JSON contract.
func logScope(gid uuid.UUID) string {
	if gid == uuid.Nil {
		return "-"
	}
	return gid.String()
}

// internalError logs a failed store call and writes a 500. gid is a parsed
// uuid.UUID (canonical hex), not free-form input.
func internalError(w http.ResponseWriter, gid uuid.UUID, what string, err error) {
	log.Printf("%s (%s): %v", what, logScope(gid), err) //#nosec G706 -- gid is a parsed uuid.UUID
	writeJSONError(w, http.StatusInternalServerError, "internal server error")
}

// storeError writes the response for a failed store read: a missing row becomes
// status/msg, anything else a logged 500. It is the single place "no such row"
// maps to an HTTP status, so a handler names only the status and message it
// wants instead of re-deriving the whole branch. Always writes a response.
func storeError(w http.ResponseWriter, gid uuid.UUID, what string, err error, status int, msg string) {
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSONError(w, status, msg)
		return
	}
	internalError(w, gid, what, err)
}

// dateLayout is the wire format for every date this API emits or accepts —
// scheduledFor, joinedOn, createdOn, lastPickedOn. One const so the format and
// the helpers below can never drift apart.
const dateLayout = "2006-01-02"

// formatDate renders a DATE column as a YYYY-MM-DD string; "" when unset.
func formatDate(d pgtype.Date) string {
	if !d.Valid {
		return ""
	}
	return d.Time.Format(dateLayout)
}

// formatTimestampDate renders a timestamptz as its UTC calendar date, so
// joined_at/created_at read on the wire exactly like a true DATE column. An
// unset timestamp yields "", though both columns are NOT NULL in practice.
func formatTimestampDate(ts pgtype.Timestamptz) string {
	if !ts.Valid {
		return ""
	}
	return ts.Time.Format(dateLayout)
}

// parseDate parses a YYYY-MM-DD wire date into a DATE param. Callers name the
// offending field in their own error message. Pure.
func parseDate(s string) (pgtype.Date, error) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return pgtype.Date{}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}
