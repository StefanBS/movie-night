package main

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// pickRequest is the JSON body of POST /groups/{groupId}/picks. IsCredited is a
// pointer so an omitted field is distinguishable from an explicit false and
// defaults to true.
type pickRequest struct {
	PickerID     string `json:"pickerId"`
	ScheduledFor string `json:"scheduledFor"`
	IsCredited   *bool  `json:"isCredited"`
}

// parsedPick is a validated pickRequest with typed fields ready for the store.
type parsedPick struct {
	PickerID     uuid.UUID
	ScheduledFor pgtype.Date
	IsCredited   bool
}

// validatePickRequest validates a decoded pickRequest: pickerId must be a UUID,
// scheduledFor must be an ISO (YYYY-MM-DD) date, and isCredited defaults to true
// when omitted. Pure — no DB, no clock.
func validatePickRequest(req pickRequest) (parsedPick, error) {
	pickerID, err := uuid.Parse(req.PickerID)
	if err != nil {
		return parsedPick{}, fmt.Errorf("invalid pickerId")
	}
	t, err := time.Parse("2006-01-02", req.ScheduledFor)
	if err != nil {
		return parsedPick{}, fmt.Errorf("invalid scheduledFor")
	}
	credited := true
	if req.IsCredited != nil {
		credited = *req.IsCredited
	}
	return parsedPick{
		PickerID:     pickerID,
		ScheduledFor: pgtype.Date{Time: t, Valid: true},
		IsCredited:   credited,
	}, nil
}

// pickResponse is the JSON shape returned by POST /groups/{groupId}/picks.
type pickResponse struct {
	ID           string `json:"id"`
	GroupID      string `json:"groupId"`
	PickerID     string `json:"pickerId"`
	IsCredited   bool   `json:"isCredited"`
	ScheduledFor string `json:"scheduledFor"`
	CreatedAt    string `json:"createdAt"`
}

// toPickResponse maps an inserted pick row to its JSON DTO. picker_id is always
// set for picks created via this endpoint, so it renders as the canonical UUID
// string; scheduled_for is YYYY-MM-DD and created_at is RFC3339.
func toPickResponse(p db.Pick) pickResponse {
	return pickResponse{
		ID:           p.ID.String(),
		GroupID:      p.GroupID.String(),
		PickerID:     uuid.UUID(p.PickerID.Bytes).String(),
		IsCredited:   p.IsCredited,
		ScheduledFor: p.ScheduledFor.Time.Format("2006-01-02"),
		CreatedAt:    p.CreatedAt.Time.Format(time.RFC3339),
	}
}
