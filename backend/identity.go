package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/google/uuid"

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

// identityResponse is the person an install acts as.
type identityResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
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
	CreateDevice(ctx context.Context, arg db.CreateDeviceParams) (db.Device, error)
	TouchDevice(ctx context.Context, tokenHash []byte) (db.TouchDeviceRow, error)
	DeleteDevice(ctx context.Context, tokenHash []byte) (int64, error)
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
			Identity: identityResponse{ID: m.UserID.String(), Name: m.Name},
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
		respondJSON(w, http.StatusOK, identityResponse{ID: row.UserID.String(), Name: row.Name}, uuid.Nil, "encode identity response")
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
