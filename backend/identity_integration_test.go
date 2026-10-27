//go:build integration

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

func TestIdentityIntegration(t *testing.T) {
	pool := freshDB(t)
	seedFixtures(t, pool)
	q := db.New(pool)

	mux := http.NewServeMux()
	mux.Handle("POST /identity", claimIdentityHandler(q))
	mux.Handle("GET /identity", getIdentityHandler(q))
	mux.Handle("DELETE /identity", releaseIdentityHandler(q))

	claimBody := func(group, user string) string {
		return fmt.Sprintf(`{"groupId":%q,"userId":%q}`, group, user)
	}
	claim := func(t *testing.T, user string) claimResponse {
		t.Helper()
		code, c := doJSON[claimResponse](t, mux, http.MethodPost, "/identity", claimBody(seededGroup, user))
		if code != http.StatusCreated {
			t.Fatalf("claim status = %d, want 201", code)
		}
		return c
	}
	whoAmI := func(t *testing.T, token string) (int, identityResponse) {
		t.Helper()
		code, b := doReqAuth(t, mux, http.MethodGet, "/identity", "", "Bearer "+token)
		var id identityResponse
		if code == http.StatusOK {
			if err := json.Unmarshal(b, &id); err != nil {
				t.Fatalf("decode identity: %v (body %s)", err, b)
			}
		}
		return code, id
	}

	t.Run("claim returns a token that resolves to the person", func(t *testing.T) {
		c := claim(t, ada)
		if c.Token == "" {
			t.Fatal("empty token")
		}
		if c.Identity.ID != ada || c.Identity.Name != "Ada" {
			t.Errorf("identity = %+v, want Ada", c.Identity)
		}
		code, id := whoAmI(t, c.Token)
		if code != http.StatusOK {
			t.Fatalf("GET status = %d, want 200", code)
		}
		if id.ID != ada || id.Name != "Ada" {
			t.Errorf("GET identity = %+v, want Ada", id)
		}
	})

	t.Run("an active guest can be claimed", func(t *testing.T) {
		if c := claim(t, frankie); c.Identity.Name != "Frankie" {
			t.Errorf("identity = %+v, want Frankie", c.Identity)
		}
	})

	t.Run("one person on two devices gets independent tokens", func(t *testing.T) {
		first, second := claim(t, blake), claim(t, blake)
		if first.Token == second.Token {
			t.Fatal("two devices got the same token")
		}
		// Releasing one leaves the other bound.
		if code, _ := doReqAuth(t, mux, http.MethodDelete, "/identity", "", "Bearer "+first.Token); code != http.StatusNoContent {
			t.Fatalf("DELETE status = %d, want 204", code)
		}
		if code, _ := whoAmI(t, first.Token); code != http.StatusUnauthorized {
			t.Errorf("released token GET status = %d, want 401", code)
		}
		if code, _ := whoAmI(t, second.Token); code != http.StatusOK {
			t.Errorf("other device GET status = %d, want 200", code)
		}
	})

	t.Run("release is idempotent", func(t *testing.T) {
		c := claim(t, cleo)
		for range 2 {
			if code, _ := doReqAuth(t, mux, http.MethodDelete, "/identity", "", "Bearer "+c.Token); code != http.StatusNoContent {
				t.Errorf("DELETE status = %d, want 204", code)
			}
		}
	})

	t.Run("an identity survives its membership going inactive", func(t *testing.T) {
		c := claim(t, cleo)
		if _, err := pool.Exec(t.Context(),
			`UPDATE memberships SET status = 'inactive' WHERE group_id = $1 AND user_id = $2`, seededGroup, cleo); err != nil {
			t.Fatalf("deactivate: %v", err)
		}
		if code, _ := whoAmI(t, c.Token); code != http.StatusOK {
			t.Errorf("GET status = %d, want 200", code)
		}
	})

	for _, tc := range []struct {
		name string
		body string
		want int
	}{
		{name: "inactive member is 422", body: claimBody(seededGroup, zed), want: http.StatusUnprocessableEntity},
		{name: "unknown member is 404", body: claimBody(seededGroup, unknownUser), want: http.StatusNotFound},
		{name: "member of another group is 404", body: claimBody(emptyGroup, ada), want: http.StatusNotFound},
		{name: "malformed user id is 400", body: claimBody(seededGroup, "nope"), want: http.StatusBadRequest},
		{name: "malformed group id is 400", body: claimBody("nope", ada), want: http.StatusBadRequest},
		{name: "malformed body is 400", body: `{`, want: http.StatusBadRequest},
	} {
		t.Run("claim: "+tc.name, func(t *testing.T) {
			if code, _ := doReq(t, mux, http.MethodPost, "/identity", tc.body); code != tc.want {
				t.Errorf("status = %d, want %d", code, tc.want)
			}
		})
	}

	for _, tc := range []struct {
		name          string
		method        string
		authorization string
	}{
		{name: "GET without a token", method: http.MethodGet},
		{name: "GET with another scheme", method: http.MethodGet, authorization: "Basic abc"},
		{name: "GET with an unknown token", method: http.MethodGet, authorization: "Bearer never-issued"},
		{name: "DELETE without a token", method: http.MethodDelete},
	} {
		t.Run(tc.name+" is 401", func(t *testing.T) {
			if code, _ := doReqAuth(t, mux, tc.method, "/identity", "", tc.authorization); code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", code)
			}
		})
	}
}
