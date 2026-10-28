package main

import (
	"context"
	"errors"
	"net/http"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// The writes that decide a Night's picker or attendees live here, and each runs
// inside the caller's withTx. A write to an existing Night locks it first
// (LockNight), so the ADR-0008 rules are checked against a Night no other write
// can change before this one commits: the picker is an attendee, attendees are
// members, and whether a pick is credited follows from the picker's role. The
// writes return at most an id; handlers read the result through GetNight.

// createNight checks a validated Night's attendees and inserts it, crediting
// the pick by the picker's role. Returns the new Night's id.
func createNight(ctx context.Context, q *db.Queries, gid uuid.UUID, night parsedCreateNight) (uuid.UUID, error) {
	roles, err := memberRoles(ctx, q, gid, night.Attendees)
	if err != nil {
		return uuid.Nil, err
	}
	return q.CreateNight(ctx, db.CreateNightParams{
		GroupID:      gid,
		ScheduledFor: night.ScheduledFor,
		StartTime:    night.StartTime,
		PickerID:     night.Picker,
		IsCredited:   creditedForRole(roles[night.Picker]),
		Attendees:    night.Attendees,
	})
}

// recordPick sets (or changes) a Night's picker, who must be one of its
// attendees as they stand once the lock is held.
func recordPick(ctx context.Context, q *db.Queries, gid, nightID, picker uuid.UUID) error {
	if _, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid}); err != nil {
		return err
	}
	attendees, err := q.ListNightAttendees(ctx, db.ListNightAttendeesParams{GroupID: gid, NightID: nightID})
	if err != nil {
		return err
	}
	role, err := attendeeRole(attendees, picker)
	if err != nil {
		return err
	}
	return q.SetNightPicker(ctx, db.SetNightPickerParams{
		NightID:    nightID,
		GroupID:    gid,
		PickerID:   picker,
		IsCredited: creditedForRole(role),
	})
}

// editNight replaces a Night's editable fields and attendee set. The picker
// must stay an attendee; it is changed only by recordPick. A taken date fails
// on the last statement, after the attendee writes; the rollback undoes them.
func editNight(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID, edit nightEdit) error {
	picker, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		return err
	}
	if !slices.Contains(edit.Attendees, picker) {
		return errPickerNotAttendee
	}
	if _, err := memberRoles(ctx, q, gid, edit.Attendees); err != nil {
		return err
	}
	if err := q.RemoveAttendeesNotIn(ctx, db.RemoveAttendeesNotInParams{PickID: nightID, Keep: edit.Attendees}); err != nil {
		return err
	}
	if err := q.AddAttendees(ctx, db.AddAttendeesParams{PickID: nightID, UserIds: edit.Attendees}); err != nil {
		return err
	}
	return q.UpdateNight(ctx, db.UpdateNightParams{
		NightID:              nightID,
		GroupID:              gid,
		ScheduledFor:         edit.ScheduledFor,
		StartTime:            edit.StartTime,
		RemindNightBefore:    edit.Reminders.NightBefore,
		RemindMorningOf:      edit.Reminders.MorningOf,
		RemindTwoHoursBefore: edit.Reminders.TwoHoursBefore,
		RemindAudience:       edit.Reminders.Audience,
	})
}

// memberRoles returns each attendee's role in the group, or errNotMember for
// the first one who has no membership.
func memberRoles(ctx context.Context, q *db.Queries, gid uuid.UUID, attendees []uuid.UUID) (map[uuid.UUID]db.MembershipRole, error) {
	members, err := q.FilterGroupMembers(ctx, db.FilterGroupMembersParams{GroupID: gid, UserIds: attendees})
	if err != nil {
		return nil, err
	}
	return attendeeRoles(attendees, members)
}

// attendeeRole finds the picker among a Night's attendees and returns their
// role, or errPickerNotAttendee. Pure.
func attendeeRole(attendees []db.ListNightAttendeesRow, picker uuid.UUID) (db.MembershipRole, error) {
	i := slices.IndexFunc(attendees, func(a db.ListNightAttendeesRow) bool { return a.ID == picker })
	if i < 0 {
		return "", errPickerNotAttendee
	}
	return attendees[i].Role, nil
}

// writeNightError maps a failed Night write to its response: a missing Night is
// a 404, a broken ADR-0008 rule a 422, a date another Night holds a 409, and
// anything else a 500.
func writeNightError(w http.ResponseWriter, gid uuid.UUID, op string, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeJSONError(w, http.StatusNotFound, "night not found")
	case errors.Is(err, errPickerNotAttendee), errors.Is(err, errNotMember):
		writeJSONError(w, http.StatusUnprocessableEntity, err.Error())
	case isUniqueViolation(err):
		writeJSONError(w, http.StatusConflict, errNightDateTaken)
	default:
		internalError(w, gid, op, err)
	}
}
