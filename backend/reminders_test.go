package main

import (
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

var (
	remNight  = uuid.MustParse("b0000000-0000-0000-0000-0000000000aa")
	remPicker = uuid.MustParse("a0000000-0000-0000-0000-000000000001") // Ada
	remGuest  = uuid.MustParse("a0000000-0000-0000-0000-000000000002") // Blake
)

// candidate is one device row for a Night on 2026-06-19 picked by Ada, with
// both slots on for everyone; opts adjusts it.
func candidate(t *testing.T, user uuid.UUID, token, zone string, opts ...func(*db.ListReminderCandidatesRow)) db.ListReminderCandidatesRow {
	t.Helper()
	row := db.ListReminderCandidatesRow{
		NightID:           remNight,
		ScheduledFor:      pgtype.Date{Time: mustDate(t, "2026-06-19"), Valid: true},
		PickerID:          remPicker,
		RemindNightBefore: true,
		RemindMorningOf:   true,
		RemindAudience:    db.ReminderAudienceEveryone,
		GroupName:         "Friday Film Club",
		PickerName:        "Ada Lovelace",
		Going:             4,
		UserID:            user,
		PushToken:         token,
		TimeZone:          zone,
	}
	for _, o := range opts {
		o(&row)
	}
	return row
}

func at(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return tm
}

func TestWantsSlot(t *testing.T) {
	off := func(r *db.ListReminderCandidatesRow) { r.RemindNightBefore, r.RemindMorningOf = false, false }
	pickerOnly := func(r *db.ListReminderCandidatesRow) { r.RemindAudience = db.ReminderAudiencePicker }
	morningOff := func(r *db.ListReminderCandidatesRow) { r.RemindMorningOf = false }
	for _, tc := range []struct {
		name string
		row  db.ListReminderCandidatesRow
		slot db.ReminderSlot
		want bool
	}{
		{name: "attendee, slot on", row: candidate(t, remGuest, "", ""), slot: db.ReminderSlotMorningOf, want: true},
		{name: "attendee, slot off", row: candidate(t, remGuest, "", "", morningOff), slot: db.ReminderSlotMorningOf},
		{name: "attendee, just the picker", row: candidate(t, remGuest, "", "", pickerOnly), slot: db.ReminderSlotNightBefore},
		{name: "picker nudge with every slot off", row: candidate(t, remPicker, "", "", off), slot: db.ReminderSlotNightBefore, want: true},
		{name: "picker morning-of with it off", row: candidate(t, remPicker, "", "", off), slot: db.ReminderSlotMorningOf},
		{name: "picker morning-of, just the picker", row: candidate(t, remPicker, "", "", pickerOnly), slot: db.ReminderSlotMorningOf, want: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := wantsSlot(tc.row, tc.slot); got != tc.want {
				t.Errorf("wantsSlot = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestReminderMessage(t *testing.T) {
	for _, tc := range []struct {
		name      string
		user      uuid.UUID
		slot      db.ReminderSlot
		wantTitle string
		wantBody  string
	}{
		{
			name: "the picker's nudge", user: remPicker, slot: db.ReminderSlotNightBefore,
			wantTitle: "✦ It's your turn — you pick tomorrow's movie",
			wantBody:  "Friday Film Club · Jun 19. Come with a film in mind.",
		},
		{
			name: "the picker on the day", user: remPicker, slot: db.ReminderSlotMorningOf,
			wantTitle: "✦ It's your turn — you pick tonight's movie",
			wantBody:  "Friday Film Club · Jun 19. Come with a film in mind.",
		},
		{
			name: "the group the night before", user: remGuest, slot: db.ReminderSlotNightBefore,
			wantTitle: "Movie night is on for tomorrow",
			wantBody:  "Ada picks · 4 going. Tap to see who's coming.",
		},
		{
			name: "the group on the day", user: remGuest, slot: db.ReminderSlotMorningOf,
			wantTitle: "Movie night is on tonight",
			wantBody:  "Ada picks · 4 going. Tap to see who's coming.",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			title, body := reminderMessage(candidate(t, tc.user, "", ""), tc.slot)
			if title != tc.wantTitle || body != tc.wantBody {
				t.Errorf("got (%q, %q), want (%q, %q)", title, body, tc.wantTitle, tc.wantBody)
			}
		})
	}
}

func TestDueReminders(t *testing.T) {
	// 18:00 the night before in Madrid (UTC+2 in June) is 16:00 UTC; 09:00 on
	// the day is 07:00 UTC. In New York (UTC-4) they are 22:00 and 13:00 UTC.
	madrid := func(user uuid.UUID, token string) db.ListReminderCandidatesRow {
		return candidate(t, user, token, "Europe/Madrid")
	}
	type want struct {
		user   uuid.UUID
		slot   db.ReminderSlot
		tokens []string
	}
	for _, tc := range []struct {
		name string
		rows []db.ListReminderCandidatesRow
		now  string
		want []want
	}{
		{
			name: "night-before slot at its time",
			rows: []db.ListReminderCandidatesRow{madrid(remPicker, "p"), madrid(remGuest, "g")},
			now:  "2026-06-18T16:00:00Z",
			want: []want{{remPicker, db.ReminderSlotNightBefore, []string{"p"}}, {remGuest, db.ReminderSlotNightBefore, []string{"g"}}},
		},
		{
			name: "still due within the window",
			rows: []db.ListReminderCandidatesRow{madrid(remGuest, "g")},
			now:  "2026-06-18T16:14:59Z",
			want: []want{{remGuest, db.ReminderSlotNightBefore, []string{"g"}}},
		},
		{name: "a missed slot is skipped", rows: []db.ListReminderCandidatesRow{madrid(remGuest, "g")}, now: "2026-06-18T16:15:00Z"},
		{name: "not yet", rows: []db.ListReminderCandidatesRow{madrid(remGuest, "g")}, now: "2026-06-18T15:59:59Z"},
		{
			name: "morning-of slot",
			rows: []db.ListReminderCandidatesRow{madrid(remGuest, "g")},
			now:  "2026-06-19T07:05:00Z",
			want: []want{{remGuest, db.ReminderSlotMorningOf, []string{"g"}}},
		},
		{
			name: "each device follows its own zone",
			rows: []db.ListReminderCandidatesRow{candidate(t, remGuest, "ny", "America/New_York")},
			now:  "2026-06-18T16:00:00Z",
		},
		{
			name: "a person's reminder goes to all their devices once one is due",
			rows: []db.ListReminderCandidatesRow{
				candidate(t, remGuest, "ny", "America/New_York"),
				madrid(remGuest, "madrid"),
			},
			now:  "2026-06-18T16:00:00Z",
			want: []want{{remGuest, db.ReminderSlotNightBefore, []string{"ny", "madrid"}}},
		},
		{
			name: "an unknown zone is skipped",
			rows: []db.ListReminderCandidatesRow{candidate(t, remGuest, "g", "Mars/Olympus")},
			now:  "2026-06-18T16:00:00Z",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := dueReminders(tc.rows, at(t, tc.now))
			if len(got) != len(tc.want) {
				t.Fatalf("got %d reminders %+v, want %d", len(got), got, len(tc.want))
			}
			for i, w := range tc.want {
				if got[i].UserID != w.user || got[i].Slot != w.slot || !slices.Equal(got[i].Tokens, w.tokens) {
					t.Errorf("[%d] = %+v, want %+v", i, got[i], w)
				}
			}
		})
	}
}

func TestCandidateDates(t *testing.T) {
	from, to := candidateDates(at(t, "2026-06-18T23:30:00-04:00")) // 03:30 UTC on the 19th
	if got := formatDate(from); got != "2026-06-18" {
		t.Errorf("from = %s, want 2026-06-18", got)
	}
	if got := formatDate(to); got != "2026-06-21" {
		t.Errorf("to = %s, want 2026-06-21", got)
	}
}
