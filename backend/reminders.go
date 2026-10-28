package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// Reminders (ADR-0010). Every minute the scheduler works out which reminders
// are due from the Nights as they are now — there is no queue of scheduled
// sends, so editing, re-dating or deleting a Night needs no cleanup. Each
// (Night, person, slot) is logged before it is sent, so a reminder goes out at
// most once; a slot more than reminderWindow old is skipped, never sent late.

// reminderWindow is how long after its time a slot may still go out, so a
// briefly stalled scheduler catches up but a long outage never sends late.
const reminderWindow = 15 * time.Minute

// reminderSlot is when one slot fires on the recipient's device: a wall-clock
// hour relative to the Night's date, or, when beforeStart is set, that long
// before the Night's start time (ADR-0011) — a slot that only exists once the
// Night has one.
type reminderSlot struct {
	slot        db.ReminderSlot
	dayOffset   int
	hour        int
	beforeStart time.Duration
}

// reminderSlots in send order.
var reminderSlots = []reminderSlot{
	{slot: db.ReminderSlotNightBefore, dayOffset: -1, hour: 18},
	{slot: db.ReminderSlotMorningOf, dayOffset: 0, hour: 9},
	{slot: db.ReminderSlotTwoHoursBefore, beforeStart: 2 * time.Hour},
}

// reminderChannel is the Android notification channel the app creates
// (mobile/pushDevice.ts); a push naming a channel the device lacks isn't shown.
const reminderChannel = "reminders"

// dueReminder is one reminder to send now: to every push token one person has.
type dueReminder struct {
	NightID uuid.UUID
	UserID  uuid.UUID
	Slot    db.ReminderSlot
	Tokens  []string
	Title   string
	Body    string
}

// slotTime is when s fires for a Night dated date that starts at start (if
// set), in loc; false when the Night has no start time for s to count back
// from. Pure.
func slotTime(s reminderSlot, date time.Time, start pgtype.Time, loc *time.Location) (time.Time, bool) {
	y, m, d := date.Date()
	if s.beforeStart == 0 {
		return time.Date(y, m, d+s.dayOffset, s.hour, 0, 0, 0, loc), true
	}
	if !start.Valid {
		return time.Time{}, false
	}
	minute := int(start.Microseconds / int64(time.Minute/time.Microsecond))
	return time.Date(y, m, d, 0, minute, 0, 0, loc).Add(-s.beforeStart), true
}

// wantsSlot reports whether a person gets a reminder for a Night in a slot.
// The picker's nudge goes out the night before whatever the Night's settings;
// otherwise the slot must be on and the audience must include them. Pure.
func wantsSlot(row db.ListReminderCandidatesRow, slot db.ReminderSlot) bool {
	isPicker := row.UserID == row.PickerID
	if isPicker && slot == db.ReminderSlotNightBefore {
		return true
	}
	on := (slot == db.ReminderSlotNightBefore && row.RemindNightBefore) ||
		(slot == db.ReminderSlotMorningOf && row.RemindMorningOf) ||
		(slot == db.ReminderSlotTwoHoursBefore && row.RemindTwoHoursBefore)
	return on && (row.RemindAudience == db.ReminderAudienceEveryone || isPicker)
}

// reminderMessage is the notification copy. Everything to the picker is the
// personal "it's your turn" form; everyone else gets the group heads-up. A
// Night with a start time names it. Pure.
func reminderMessage(row db.ListReminderCandidatesRow, slot db.ReminderSlot) (title, body string) {
	tomorrow := slot == db.ReminderSlotNightBefore
	at := ""
	if row.StartTime.Valid {
		at = " at " + formatStartTime(row.StartTime)
	}
	if row.UserID == row.PickerID {
		whose := "tonight's"
		if tomorrow {
			whose = "tomorrow's"
		}
		return "✦ It's your turn — you pick " + whose + " movie",
			fmt.Sprintf("%s · %s%s. Come with a film in mind.", row.GroupName, row.ScheduledFor.Time.Format("Jan 2"), at)
	}
	switch {
	case slot == db.ReminderSlotTwoHoursBefore:
		title = "Movie night starts" + at
	case tomorrow:
		title = "Movie night is on for tomorrow" + at
	default:
		title = "Movie night is on tonight" + at
	}
	return title, fmt.Sprintf("%s picks · %d going. Tap to see who's coming.", firstName(row.PickerName), row.Going)
}

// formatStartTime is a start time as reminder copy shows it, e.g. "7:30 PM".
// Pure.
func formatStartTime(t pgtype.Time) string {
	return time.Time{}.Add(time.Duration(t.Microseconds) * time.Microsecond).Format("3:04 PM")
}

// firstName is the first word of a person's name. Pure.
func firstName(name string) string {
	if f := strings.Fields(name); len(f) > 0 {
		return f[0]
	}
	return name
}

// dueReminders picks the reminders due at now from the candidate rows (one row
// per device, ordered by Night then person). A person's reminder is due once
// any of their devices reaches the slot's time in its own zone, and then goes
// to all of their devices. A device with an unknown zone is skipped. Pure.
func dueReminders(rows []db.ListReminderCandidatesRow, now time.Time) []dueReminder {
	var out []dueReminder
	for start := 0; start < len(rows); {
		end := start + 1
		for end < len(rows) && rows[end].NightID == rows[start].NightID && rows[end].UserID == rows[start].UserID {
			end++
		}
		person := rows[start:end]
		start = end

		for _, s := range reminderSlots {
			if !wantsSlot(person[0], s.slot) {
				continue
			}
			due := false
			for _, d := range person {
				loc, err := time.LoadLocation(d.TimeZone)
				if err != nil {
					continue
				}
				at, ok := slotTime(s, d.ScheduledFor.Time, d.StartTime, loc)
				if ok && !now.Before(at) && now.Before(at.Add(reminderWindow)) {
					due = true
					break
				}
			}
			if !due {
				continue
			}
			tokens := make([]string, 0, len(person))
			for _, d := range person {
				tokens = append(tokens, d.PushToken)
			}
			title, body := reminderMessage(person[0], s.slot)
			out = append(out, dueReminder{
				NightID: person[0].NightID,
				UserID:  person[0].UserID,
				Slot:    s.slot,
				Tokens:  tokens,
				Title:   title,
				Body:    body,
			})
		}
	}
	return out
}

// reminderStore is the subset of *db.Queries the scheduler needs.
type reminderStore interface {
	ListReminderCandidates(ctx context.Context, arg db.ListReminderCandidatesParams) ([]db.ListReminderCandidatesRow, error)
	LogReminderSent(ctx context.Context, arg db.LogReminderSentParams) (int64, error)
	ClearPushToken(ctx context.Context, pushToken pgtype.Text) error
}

// candidateDates is the range of Night dates that can have a slot due at now:
// a device's local date is within a day of UTC, and the night-before slot
// belongs to the next day's Night. Pure.
func candidateDates(now time.Time) (from, to pgtype.Date) {
	y, m, d := now.UTC().Date()
	day := func(offset int) pgtype.Date {
		return pgtype.Date{Time: time.Date(y, m, d+offset, 0, 0, 0, 0, time.UTC), Valid: true}
	}
	return day(-1), day(2)
}

// sendDueReminders sends every reminder due at now. A reminder is logged
// before it is sent, so a failed send loses it rather than repeating it.
func sendDueReminders(ctx context.Context, store reminderStore, push *expoPusher, now time.Time) error {
	from, to := candidateDates(now)
	rows, err := store.ListReminderCandidates(ctx, db.ListReminderCandidatesParams{FromDate: from, ToDate: to})
	if err != nil {
		return fmt.Errorf("list reminder candidates: %w", err)
	}
	var msgs []pushMessage
	for _, r := range dueReminders(rows, now) {
		n, err := store.LogReminderSent(ctx, db.LogReminderSentParams{NightID: r.NightID, UserID: r.UserID, Slot: r.Slot})
		if err != nil {
			return fmt.Errorf("log reminder: %w", err)
		}
		if n == 0 {
			continue // already sent
		}
		for _, tok := range r.Tokens {
			msgs = append(msgs, pushMessage{
				To:        tok,
				Title:     r.Title,
				Body:      r.Body,
				Data:      map[string]string{"nightId": r.NightID.String()},
				ChannelID: reminderChannel,
				Sound:     "default",
				Priority:  "high",
			})
		}
	}
	if len(msgs) == 0 {
		return nil
	}
	tickets, err := push.Send(ctx, msgs)
	if err != nil {
		return fmt.Errorf("send reminders: %w", err)
	}
	for i, t := range tickets {
		if t.Status != "error" {
			continue
		}
		if t.Details.Error == "DeviceNotRegistered" {
			if err := store.ClearPushToken(ctx, pgtype.Text{String: msgs[i].To, Valid: true}); err != nil {
				log.Printf("reminders: clear push token: %v", err)
			}
			continue
		}
		log.Printf("reminders: push to a device failed: %s (%s)", t.Message, t.Details.Error)
	}
	return nil
}

// runReminders runs the scheduler every interval until ctx is done.
func runReminders(ctx context.Context, store reminderStore, push *expoPusher, interval time.Duration) {
	tick := time.NewTicker(interval)
	defer tick.Stop()
	for {
		if err := sendDueReminders(ctx, store, push, time.Now()); err != nil && ctx.Err() == nil {
			log.Printf("reminders: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

// pushMessage is one Expo push message.
type pushMessage struct {
	To        string            `json:"to"`
	Title     string            `json:"title"`
	Body      string            `json:"body"`
	Data      map[string]string `json:"data"`
	ChannelID string            `json:"channelId"`
	Sound     string            `json:"sound"`
	Priority  string            `json:"priority"`
}

// pushTicket is Expo's per-message answer, in the order the messages were sent.
type pushTicket struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Details struct {
		Error string `json:"error"`
	} `json:"details"`
}

// expoPushBatch is the most messages Expo accepts in one request.
const expoPushBatch = 100

// expoPusher sends through Expo's push service. url is injectable so tests
// point it at a local httptest fake (real HTTP, fake Expo). accessToken is
// only needed once push security is enabled for the project.
type expoPusher struct {
	url         string
	accessToken string
	client      *http.Client
}

func newExpoPusher(accessToken string) *expoPusher {
	return &expoPusher{
		url:         "https://exp.host/--/api/v2/push/send",
		accessToken: accessToken,
		client:      &http.Client{Timeout: 15 * time.Second},
	}
}

// Send posts msgs in batches and returns one ticket per message, in order.
func (p *expoPusher) Send(ctx context.Context, msgs []pushMessage) ([]pushTicket, error) {
	tickets := make([]pushTicket, 0, len(msgs))
	for start := 0; start < len(msgs); start += expoPushBatch {
		batch := msgs[start:min(start+expoPushBatch, len(msgs))]
		got, err := p.sendBatch(ctx, batch)
		if err != nil {
			return nil, err
		}
		if len(got) != len(batch) {
			return nil, fmt.Errorf("expo push: %d tickets for %d messages", len(got), len(batch))
		}
		tickets = append(tickets, got...)
	}
	return tickets, nil
}

// sendBatch posts one batch.
//
// gosec flags the request below as G704 (SSRF). The destination is the
// constant Expo URL set in newExpoPusher (a test fake in tests); nothing from a
// request reaches it.
func (p *expoPusher) sendBatch(ctx context.Context, batch []pushMessage) ([]pushTicket, error) {
	payload, err := json.Marshal(batch)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.url, bytes.NewReader(payload)) //#nosec G704 -- destination is the constant Expo push URL
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if p.accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+p.accessToken)
	}
	res, err := p.client.Do(req) //#nosec G704 -- see above: request destination is not user-controlled
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("expo push: status %d: %s", res.StatusCode, body)
	}
	var out struct {
		Data []pushTicket `json:"data"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("expo push: decode tickets: %w", err)
	}
	return out.Data, nil
}
