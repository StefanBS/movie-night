package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// The writes that decide a Night's picker, attendees or film live here, and each runs
// inside the caller's withTx. A write to an existing Night locks it first
// (LockNight), so no other write can change it before this one commits. The
// schema holds the Night rules (ADR-0008, ADR-0012, ADR-0014): the picker is
// an attendee, attendees and the picker are members, a Watched Night has a
// film and doesn't repeat, and the queries credit a pick by the picker's role.
// writeNightError maps each broken constraint to its response; only the
// clock-dependent ADR-0013 bound is checked here. The writes return at most an
// id; handlers read the result through GetNight.

// createNight inserts a validated Night and its attendees. Returns the new
// Night's id.
func createNight(ctx context.Context, q *db.Queries, gid uuid.UUID, night parsedCreateNight) (uuid.UUID, error) {
	freq, intervalWeeks, weekOfMonth := repeatColumns(night.Repeat)
	return q.CreateNight(ctx, db.CreateNightParams{
		GroupID:             gid,
		ScheduledFor:        night.ScheduledFor,
		StartTime:           night.StartTime,
		PickerID:            night.Picker,
		Attendees:           night.Attendees,
		RepeatFreq:          freq,
		RepeatIntervalWeeks: intervalWeeks,
		RepeatWeekOfMonth:   weekOfMonth,
	})
}

// editNight replaces a Night's editable fields and attendee set, and when the
// edit says so changes its picker and records it as watched (ADR-0012). A
// Night being recorded, or already a Watched Night, must be dated no later
// than recordableAsWatched allows at now (ADR-0013). Recording a repeating
// Night moves its series on (ADR-0014). The schema's rules fail on the
// statement that breaks them, or at COMMIT for the picker being an attendee;
// the rollback undoes the writes before it.
func editNight(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID, edit nightEdit, now time.Time) error {
	locked, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid})
	if err != nil {
		return err
	}
	picker := locked.PickerID
	if edit.Picker.Valid {
		picker = edit.Picker.Bytes
	}
	if (edit.Watched || locked.IsWatched) && !recordableAsWatched(edit.ScheduledFor, now) {
		return errWatchedDateAhead
	}
	if err := q.RemoveAttendeesNotIn(ctx, db.RemoveAttendeesNotInParams{NightID: nightID, Keep: edit.Attendees}); err != nil {
		return err
	}
	if err := q.AddAttendees(ctx, db.AddAttendeesParams{NightID: nightID, GroupID: gid, UserIds: edit.Attendees}); err != nil {
		return err
	}
	if edit.Picker.Valid {
		if err := q.SetNightPicker(ctx, db.SetNightPickerParams{NightID: nightID, GroupID: gid, PickerID: picker}); err != nil {
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
		RemindAudience:       db.ReminderAudience(edit.Reminders.Audience),
		RepeatFreq:           freq,
		RepeatIntervalWeeks:  intervalWeeks,
		RepeatWeekOfMonth:    weekOfMonth,
	}); err != nil {
		return err
	}
	if !edit.Watched {
		return nil
	}
	// The series moves on from this Night's repeat before recording ends it.
	if edit.Repeat != nil {
		if err := moveSeriesOn(ctx, q, gid, nightID, picker, *edit.Repeat, edit.ScheduledFor.Time, false, now); err != nil {
			return err
		}
	}
	return q.RecordNightWatched(ctx, db.RecordNightWatchedParams{NightID: nightID, GroupID: gid})
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

// clearFilm detaches a Night's film. A Watched Night keeps its film
// (ck_night_watched_has_film), since recording is not undone. Clearing a Night
// that has no film is not an error.
func clearFilm(ctx context.Context, q *db.Queries, gid, nightID uuid.UUID) error {
	if _, err := q.LockNight(ctx, db.LockNightParams{NightID: nightID, GroupID: gid}); err != nil {
		return err
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
	attendees, err := q.ListAttendees(ctx, db.ListAttendeesParams{GroupID: gid, NightID: pgtype.UUID{Bytes: from, Valid: true}})
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
	_, err = q.CreateNextInSeries(ctx, db.CreateNextInSeriesParams{
		GroupID:      gid,
		FromNight:    from,
		ScheduledFor: pgtype.Date{Time: next, Valid: true},
		PickerID:     picker,
	})
	return err
}

// nightConstraintError is the response for a Night write that broke a named
// schema constraint: its status and the message the app shows.
type nightConstraintError struct {
	status int
	msg    string
}

// nightConstraintErrors maps each Night rule the schema enforces, by
// constraint name, to its response. A violation of any other constraint is a
// bug, so it stays a 500.
var nightConstraintErrors = map[string]nightConstraintError{
	"uq_night_per_group_date":    {http.StatusConflict, "there is already a night on that date"},
	"fk_night_picker_attends":    {http.StatusUnprocessableEntity, "picker is not an attendee of this night"},
	"fk_night_picker_member":     {http.StatusUnprocessableEntity, "picker is not a member of this group"},
	"fk_attendance_member":       {http.StatusUnprocessableEntity, "attendee is not a member of this group"},
	"ck_night_watched_has_film":  {http.StatusUnprocessableEntity, "a watched night must have a film"},
	"ck_night_watched_no_repeat": {http.StatusUnprocessableEntity, "a watched night can't repeat"},
}

// writeNightError maps a failed Night write to its response: a missing Night
// is a 404; a broken schema rule its nightConstraintErrors entry, whether the
// statement or a deferred check at COMMIT broke it; a Night dated too far
// ahead to be watched a 422; and anything else a 500.
func writeNightError(w http.ResponseWriter, gid uuid.UUID, op string, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if e, ok := nightConstraintErrors[pgErr.ConstraintName]; ok {
			writeJSONError(w, e.status, e.msg)
			return
		}
	}
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeJSONError(w, http.StatusNotFound, "night not found")
	case errors.Is(err, errWatchedDateAhead):
		writeJSONError(w, http.StatusUnprocessableEntity, err.Error())
	default:
		internalError(w, gid, op, err)
	}
}
