package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// An install's identity (ADR-0009): the person it acts as, claimed once from a
// group's roster. The claim is honor-system; the bearer token it returns proves
// that later requests come from the device that made the claim. claimIdentity is
// the single place tokens are issued, so stronger proof (a per-person code, a
// sign-in) slots in front of it without changing the device model.

// claimRequest is the JSON body of POST /identity. A future proof of identity
// joins these fields.
type claimRequest struct {
	GroupID string `json:"groupId"`
	UserID  string `json:"userId"`
}

// identityResponse is the person an install acts as, with their one personal
// reminder setting (ADR-0010).
type identityResponse struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	RemindersMuted bool   `json:"remindersMuted"`
}

// claimResponse is identityResponse plus the bearer token, returned once.
type claimResponse struct {
	Token    string           `json:"token"`
	Identity identityResponse `json:"identity"`
}

// identityStore is the subset of *db.Queries the identity handlers need; the
// real *db.Queries satisfies it.
type identityStore interface {
	GetGroupMember(ctx context.Context, arg db.GetGroupMemberParams) (db.GetGroupMemberRow, error)
	CreateDevice(ctx context.Context, arg db.CreateDeviceParams) (db.CreateDeviceRow, error)
	TouchDevice(ctx context.Context, tokenHash []byte) (db.TouchDeviceRow, error)
	DeleteDevice(ctx context.Context, tokenHash []byte) (int64, error)
	RegisterPush(ctx context.Context, arg db.RegisterPushParams) (int64, error)
	SetRemindersMuted(ctx context.Context, arg db.SetRemindersMutedParams) (db.SetRemindersMutedRow, error)
}

// pushRequest is the JSON body of PUT /identity/push.
type pushRequest struct {
	PushToken string `json:"pushToken"`
	TimeZone  string `json:"timeZone"`
}

// preferencesRequest is the JSON body of PUT /identity/preferences.
type preferencesRequest struct {
	RemindersMuted *bool `json:"remindersMuted"`
}

// validatePushRequest requires an Expo push token and an IANA time zone the
// server knows ("Europe/Madrid"), since reminder slots are wall-clock times
// on the device. Pure.
func validatePushRequest(req pushRequest) error {
	tok := req.PushToken
	if !(strings.HasPrefix(tok, "ExponentPushToken[") || strings.HasPrefix(tok, "ExpoPushToken[")) ||
		!strings.HasSuffix(tok, "]") || len(tok) > 256 {
		return fmt.Errorf("invalid pushToken")
	}
	if req.TimeZone == "" || req.TimeZone == "Local" {
		return fmt.Errorf("invalid timeZone")
	}
	if _, err := time.LoadLocation(req.TimeZone); err != nil {
		return fmt.Errorf("invalid timeZone")
	}
	return nil
}

// newToken returns a fresh random bearer token (32 bytes, base64url).
func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// hashToken is the form a token is stored and looked up in. Pure.
func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// bearerToken extracts the token from an "Authorization: Bearer <token>" header
// value; ok=false when the header is missing, another scheme, or empty. Pure.
func bearerToken(header string) (string, bool) {
	scheme, token, found := strings.Cut(header, " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}

// requireBearer reads the request's bearer token, writing a 401 when there is
// none. ok=false means a response was already written.
func requireBearer(w http.ResponseWriter, r *http.Request) (string, bool) {
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing bearer token")
	}
	return token, ok
}

// claimIdentityHandler serves POST /identity: the install claims a person with
// an active membership in the group and receives a bearer token for it.
func claimIdentityHandler(store identityStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		req, ok := decodeJSON[claimRequest](w, r)
		if !ok {
			return
		}
		gid, ok := parseUUID(w, req.GroupID, "invalid group id")
		if !ok {
			return
		}
		uid, ok := parseUUID(w, req.UserID, "invalid user id")
		if !ok {
			return
		}
		m, err := store.GetGroupMember(r.Context(), db.GetGroupMemberParams{GroupID: gid, UserID: uid})
		if err != nil {
			storeError(w, gid, "get group member", err, http.StatusNotFound, "member not found")
			return
		}
		if m.Status != db.MembershipStatusActive {
			writeJSONError(w, http.StatusUnprocessableEntity, "member is inactive")
			return
		}
		token, err := newToken()
		if err != nil {
			internalError(w, gid, "generate token", err)
			return
		}
		if _, err := store.CreateDevice(r.Context(), db.CreateDeviceParams{UserID: uid, TokenHash: hashToken(token)}); err != nil {
			internalError(w, gid, "create device", err)
			return
		}
		respondJSON(w, http.StatusCreated, claimResponse{
			Token:    token,
			Identity: identityResponse{ID: m.UserID.String(), Name: m.Name, RemindersMuted: m.RemindersMuted},
		}, gid, "encode claim response")
	}
}

// getIdentityHandler serves GET /identity: who the bearer's install acts as. An
// unknown or released token is a 401, which tells the app to claim again.
func getIdentityHandler(store identityStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := requireBearer(w, r)
		if !ok {
			return
		}
		row, err := store.TouchDevice(r.Context(), hashToken(token))
		if err != nil {
			storeError(w, uuid.Nil, "touch device", err, http.StatusUnauthorized, "unknown token")
			return
		}
		respondJSON(w, http.StatusOK, identityResponse{ID: row.UserID.String(), Name: row.Name, RemindersMuted: row.RemindersMuted}, uuid.Nil, "encode identity response")
	}
}

// releaseIdentityHandler serves DELETE /identity: the install gives up its
// identity, revoking the token. Idempotent — an unknown token is already
// released.
func releaseIdentityHandler(store identityStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := requireBearer(w, r)
		if !ok {
			return
		}
		if _, err := store.DeleteDevice(r.Context(), hashToken(token)); err != nil {
			internalError(w, uuid.Nil, "delete device", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// registerPushHandler serves PUT /identity/push: the install's Expo push token
// and time zone, re-sent on every launch so both stay current. 204 on success;
// an unknown or released token is a 401.
func registerPushHandler(store identityStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := requireBearer(w, r)
		if !ok {
			return
		}
		req, ok := decodeJSON[pushRequest](w, r)
		if !ok {
			return
		}
		if err := validatePushRequest(req); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		n, err := store.RegisterPush(r.Context(), db.RegisterPushParams{
			TokenHash: hashToken(token),
			PushToken: pgtype.Text{String: req.PushToken, Valid: true},
			TimeZone:  pgtype.Text{String: req.TimeZone, Valid: true},
		})
		if err != nil {
			internalError(w, uuid.Nil, "register push", err)
			return
		}
		if n == 0 {
			writeJSONError(w, http.StatusUnauthorized, "unknown token")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// setPreferencesHandler serves PUT /identity/preferences: body
// {"remindersMuted"} mutes or unmutes every reminder and nudge to the
// install's identity, on all of their devices. Returns the identity.
func setPreferencesHandler(store identityStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := requireBearer(w, r)
		if !ok {
			return
		}
		req, ok := decodeJSON[preferencesRequest](w, r)
		if !ok {
			return
		}
		if req.RemindersMuted == nil {
			writeJSONError(w, http.StatusBadRequest, "remindersMuted is required")
			return
		}
		row, err := store.SetRemindersMuted(r.Context(), db.SetRemindersMutedParams{
			TokenHash:      hashToken(token),
			RemindersMuted: *req.RemindersMuted,
		})
		if err != nil {
			storeError(w, uuid.Nil, "set reminders muted", err, http.StatusUnauthorized, "unknown token")
			return
		}
		respondJSON(w, http.StatusOK, identityResponse{ID: row.UserID.String(), Name: row.Name, RemindersMuted: row.RemindersMuted}, uuid.Nil, "encode identity response")
	}
}
