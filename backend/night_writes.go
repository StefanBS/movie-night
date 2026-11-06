package main

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// The writes that decide a Night's picker, attendees or film live here, and each runs
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
	freq, intervalWeeks, weekOfMonth := repeatColumns(night.Repeat)
	return q.CreateNight(ctx, db.CreateNightParams{
		GroupID:             gid,
		ScheduledFor:        night.ScheduledFor,
		StartTime:           night.StartTime,
		PickerID:            night.Picker,
		IsCredited:          creditedForRole(roles[night.Picker]),
		Attendees:           night.Attendees,
		RepeatFreq:          freq,
		RepeatIntervalWeeks: intervalWeeks,
		RepeatWeekOfMonth:   weekOfMonth,
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

// editNight replaces a Night's editable fields and attendee set, and when the
// edit says so changes its picker and records it as watched (ADR-0012). The
// picker, new or kept, must be an attendee, and only a Night with a film can
// be recorded. A Night being recorded, or already a Watched Night, must be
// dated no later than recordableAsWatched allows at now (ADR-0013), and a
// Watched Night can't repeat. Recording a repeating Night moves its series on
// (ADR-0014). A taken date fails on the UpdateNight statement, after the
// attendee writes; the rollback undoes them.
func editNight(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID, edit nightEdit, now time.Time) error {
	locked, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		return err
	}
	picker := locked.PickerID
	if edit.Picker.Valid {
		picker = edit.Picker.Bytes
	}
	if !slices.Contains(edit.Attendees, picker) {
		return errPickerNotAttendee
	}
	roles, err := memberRoles(ctx, q, gid, edit.Attendees)
	if err != nil {
		return err
	}
	if edit.Watched && !locked.HasMovie {
		return errWatchedWithoutFilm
	}
	if (edit.Watched || locked.IsWatched) && !recordableAsWatched(edit.ScheduledFor, now) {
		return errWatchedDateAhead
	}
	if locked.IsWatched && edit.Repeat != nil {
		return errWatchedRepeats
	}
	if err := q.RemoveAttendeesNotIn(ctx, db.RemoveAttendeesNotInParams{NightID: nightID, Keep: edit.Attendees}); err != nil {
		return err
	}
	if err := q.AddAttendees(ctx, db.AddAttendeesParams{NightID: nightID, UserIds: edit.Attendees}); err != nil {
		return err
	}
	if edit.Picker.Valid {
		if err := q.SetNightPicker(ctx, db.SetNightPickerParams{
			NightID:    nightID,
			GroupID:    gid,
			PickerID:   picker,
			IsCredited: creditedForRole(roles[picker]),
		}); err != nil {
			return err
		}
	}
	freq, intervalWeeks, weekOfMonth := repeatColumns(edit.Repeat)
	if err := q.UpdateNight(ctx, db.UpdateNightParams{
		NightID:              nightID,
		GroupID:              gid,
		ScheduledFor:         edit.ScheduledFor,
		StartTime:            edit.StartTime,
		RemindNightBefore:    edit.Reminders.NightBefore,
		RemindMorningOf:      edit.Reminders.MorningOf,
		RemindTwoHoursBefore: edit.Reminders.TwoHoursBefore,
		RemindAudience:       edit.Reminders.Audience,
		RepeatFreq:           freq,
		RepeatIntervalWeeks:  intervalWeeks,
		RepeatWeekOfMonth:    weekOfMonth,
	}); err != nil {
		return err
	}
	if !edit.Watched {
		return nil
	}
	if err := q.RecordNightWatched(ctx, db.RecordNightWatchedParams{NightID: nightID, GroupID: gid}); err != nil {
		return err
	}
	if edit.Repeat == nil {
		return nil
	}
	if err := moveSeriesOn(ctx, q, gid, nightID, picker, *edit.Repeat, edit.ScheduledFor.Time, false, now); err != nil {
		return err
	}
	return q.ClearNightRepeat(ctx, db.ClearNightRepeatParams{NightID: nightID, GroupID: gid})
}

// cancelNight deletes a Night ("Cancel this night"). A repeating Night's
// series moves on first, so cancelling skips one date rather than ending the
// series (ADR-0014). A missing Night is not an error: deleting is idempotent.
func cancelNight(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID, now time.Time) error {
	locked, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if rule := repeatFromColumns(locked.RepeatFreq, locked.RepeatIntervalWeeks, locked.RepeatWeekOfMonth); rule != nil {
		if err := moveSeriesOn(ctx, q, gid, nightID, locked.PickerID, *rule, locked.ScheduledFor.Time, true, now); err != nil {
			return err
		}
	}
	return q.DeleteNight(ctx, db.DeleteNightParams{NightID: nightID, GroupID: gid})
}

// setFilm caches a film fetched from TMDB and attaches it to a Night, replacing
// any film it had: changing a Watched Night's film is the correction path, so
// it stays allowed. The TMDB fetch happens before the caller's transaction.
func setFilm(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID, movie movieResult) error {
	if _, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid}); err != nil {
		return err
	}
	movieID, err := q.UpsertMovie(ctx, db.UpsertMovieParams{
		TmdbID:      movie.TMDBID,
		Title:       movie.Title,
		ReleaseYear: int4Ptr(movie.ReleaseYear),
		PosterPath:  pgText(movie.PosterPath),
		// Never nil, so the NOT NULL text[] column never gets a NULL.
		Genres:         genresOrEmpty(movie.Genres),
		RuntimeMinutes: int4Ptr(movie.RuntimeMinutes),
	})
	if err != nil {
		return err
	}
	return q.SetNightMovie(ctx, db.SetNightMovieParams{
		MovieID: pgtype.UUID{Bytes: movieID, Valid: true},
		NightID: nightID,
		GroupID: gid,
	})
}

// clearFilm detaches a Night's film. A Watched Night keeps its film, since a
// Night needs one to be recorded and recording is not undone. Clearing a Night
// that has no film is not an error.
func clearFilm(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID) error {
	locked, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		return err
	}
	if locked.IsWatched {
		return errWatchedFilmCleared
	}
	return q.ClearNightMovie(ctx, db.ClearNightMovieParams{NightID: nightID, GroupID: gid})
}

// moveSeriesOn opens the next Night of the series on Night from (dated date,
// picked by picker) on nextSeriesDate (ADR-0014). If a Night not yet watched
// already holds that date, it joins the series instead (keeping its own
// repeat, if it has one); a Watched Night there is passed over for the
// following date. A new Night copies from's start time, reminders, repeat and
// attendees, and its picker leads the turn ranking over those attendees, or
// is picker again when none of them is in the rotation. When from is being
// cancelled, its pick is left out of the ranking, so its picker keeps the
// turn they didn't get.
func moveSeriesOn(ctx context.Context, q *db.Queries, gid, from, picker uuid.UUID, rule repeatRule, date time.Time, cancelled bool, now time.Time) error {
	next := nextSeriesDate(rule, date, now)
	for {
		taken, err := q.LockNightOnDate(ctx, db.LockNightOnDateParams{GroupID: gid, ScheduledFor: pgtype.Date{Time: next, Valid: true}})
		if errors.Is(err, pgx.ErrNoRows) {
			break
		}
		if err != nil {
			return err
		}
		if !taken.IsWatched {
			return q.JoinSeries(ctx, db.JoinSeriesParams{NightID: taken.ID, GroupID: gid, FromNight: from})
		}
		next = nextOccurrence(rule, next)
	}
	attendees, err := q.ListNightAttendees(ctx, db.ListNightAttendeesParams{GroupID: gid, NightID: from})
	if err != nil {
		return err
	}
	var exclude pgtype.UUID
	if cancelled {
		exclude = pgtype.UUID{Bytes: from, Valid: true}
	}
	ranked, err := q.RankGroupTurn(ctx, db.RankGroupTurnParams{GroupID: gid, ExcludeNight: exclude, Present: presentIDs(attendees)})
	if err != nil {
		return err
	}
	if len(ranked) > 0 {
		picker = ranked[0].ID
	}
	role, err := attendeeRole(attendees, picker)
	if err != nil {
		return err
	}
	_, err = q.CreateNextInSeries(ctx, db.CreateNextInSeriesParams{
		GroupID:      gid,
		FromNight:    from,
		ScheduledFor: pgtype.Date{Time: next, Valid: true},
		PickerID:     picker,
		IsCredited:   creditedForRole(role),
	})
	return err
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
// a 404; a broken ADR-0008 rule, recording a Night with no film or before its
// date, or clearing a Watched Night's film, a 422; a date another Night holds a 409; and anything else a 500.
func writeNightError(w http.ResponseWriter, gid uuid.UUID, op string, err error) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeJSONError(w, http.StatusNotFound, "night not found")
	case errors.Is(err, errPickerNotAttendee), errors.Is(err, errNotMember),
		errors.Is(err, errWatchedWithoutFilm), errors.Is(err, errWatchedDateAhead),
		errors.Is(err, errWatchedRepeats), errors.Is(err, errWatchedFilmCleared):
		writeJSONError(w, http.StatusUnprocessableEntity, err.Error())
	case isUniqueViolation(err):
		writeJSONError(w, http.StatusConflict, errNightDateTaken)
	default:
		internalError(w, gid, op, err)
	}
}
