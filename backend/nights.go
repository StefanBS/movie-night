package main

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// createNightRequest is the JSON body of POST /groups/{groupId}/nights.
type createNightRequest struct {
	ScheduledFor string   `json:"scheduledFor"`
	Attendees    []string `json:"attendees"`
}

// parsedCreateNight is a validated createNightRequest. Attendees is deduped,
// first-seen order, and always non-nil (possibly empty).
type parsedCreateNight struct {
	ScheduledFor pgtype.Date
	Attendees    []uuid.UUID
}

// parseAttendeeIDs parses and de-duplicates attendee UUID strings, preserving
// first-seen order. Always returns a non-nil slice. Pure.
func parseAttendeeIDs(raw []string) ([]uuid.UUID, error) {
	seen := make(map[uuid.UUID]bool, len(raw))
	ids := make([]uuid.UUID, 0, len(raw))
	for _, s := range raw {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, fmt.Errorf("invalid attendee id")
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids, nil
}

// validateCreateNightRequest validates a decoded body: scheduledFor must be an
// ISO (YYYY-MM-DD) date and every attendee must be a UUID. Pure — no DB, no clock.
func validateCreateNightRequest(req createNightRequest) (parsedCreateNight, error) {
	t, err := time.Parse("2006-01-02", req.ScheduledFor)
	if err != nil {
		return parsedCreateNight{}, fmt.Errorf("invalid scheduledFor")
	}
	attendees, err := parseAttendeeIDs(req.Attendees)
	if err != nil {
		return parsedCreateNight{}, err
	}
	return parsedCreateNight{
		ScheduledFor: pgtype.Date{Time: t, Valid: true},
		Attendees:    attendees,
	}, nil
}

// attendee is one person recorded as present on a night.
type attendee struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

// nightResponse is the JSON shape for a night and its current attendees.
type nightResponse struct {
	ID           string     `json:"id"`
	ScheduledFor string     `json:"scheduledFor"`
	Attendees    []attendee `json:"attendees"`
}

// toNightResponse maps a night row + attendee rows to the night DTO. Attendees
// is always non-nil so an empty list encodes as [] rather than null.
func toNightResponse(p db.Pick, rows []db.ListNightAttendeesRow) nightResponse {
	attendees := make([]attendee, 0, len(rows))
	for _, r := range rows {
		attendees = append(attendees, attendee{
			ID:   r.ID.String(),
			Name: r.Name,
			Role: string(r.Role),
		})
	}
	return nightResponse{
		ID:           p.ID.String(),
		ScheduledFor: p.ScheduledFor.Time.Format("2006-01-02"),
		Attendees:    attendees,
	}
}

// presentIDs extracts attendee user IDs as a NON-NIL (possibly empty) slice to
// pass as RankGroupTurn's present set. Empty (not nil) makes the ranking exclude
// everyone — distinct from nil, which RankGroupTurn treats as "rank all core".
func presentIDs(rows []db.ListNightAttendeesRow) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return ids
}
