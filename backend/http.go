package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
)

// This file holds the HTTP plumbing shared across every handler family: path
// parsing and the JSON response/error contract. Keeping it in one place means
// "how does this service parse paths and emit errors" is findable without
// opening a feature handler.

// pathUUID parses the named path segment as a UUID. On a malformed value it
// writes a 400 with errMsg and returns ok=false (the handler should then return).
// This is the single primitive every route uses to validate an id in the path;
// routes with two ids (group + user/night) call it once per segment.
func pathUUID(w http.ResponseWriter, r *http.Request, segment, errMsg string) (uuid.UUID, bool) {
	id, err := uuid.Parse(r.PathValue(segment))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, errMsg)
		return uuid.UUID{}, false
	}
	return id, true
}

// writeJSONError writes a JSON error body with a matching Content-Type, so every
// response this service emits — success and error alike — is application/json.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// internalError logs a failed store call and writes a 500. gid is a parsed
// uuid.UUID (canonical hex), not free-form input.
func internalError(w http.ResponseWriter, gid uuid.UUID, what string, err error) {
	log.Printf("%s (%s): %v", what, gid, err) //#nosec G706 -- gid is a parsed uuid.UUID
	writeJSONError(w, http.StatusInternalServerError, "internal server error")
}
