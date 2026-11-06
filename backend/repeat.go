package main

import (
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/stefanbs/movie-night-app/backend/internal/db"
)

// A repeating Night (ADR-0014) carries its rule; the series lives on one
// Night at a time. Recording that Night as watched, or cancelling it, opens
// the next one on nextSeriesDate. Dates are calendar dates with no zone
// (ADR-0011), so the math here works on UTC midnights and DST never applies.

// repeatFreq is how a series repeats: every N weeks on the Night's weekday,
// or monthly on the Nth (or last) of that weekday.
type repeatFreq = db.RepeatFreq

const (
	repeatWeekly  = db.RepeatFreqWeekly
	repeatMonthly = db.RepeatFreqMonthly
)

// lastWeekOfMonth is the monthly WeekOfMonth for "the last <weekday>". A
// Night on a 5th weekday repeats on the last one, which every month has.
const lastWeekOfMonth = -1

// repeatRule is a validated repeat. IntervalWeeks (1 or 2) is set only for
// weekly, WeekOfMonth (1–4, or lastWeekOfMonth) only for monthly. The weekday
// is always the Night's own.
type repeatRule struct {
	Freq          repeatFreq
	IntervalWeeks int16
	WeekOfMonth   int16
}

// nextSeriesDate is the date a series moves on to from a Night dated night:
// the first occurrence after it that is on or after now's UTC date, so a
// Night recorded (or cancelled) late doesn't open one that is already past.
// Pure.
func nextSeriesDate(rule repeatRule, night, now time.Time) time.Time {
	y, m, d := now.UTC().Date()
	today := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	next := nextOccurrence(rule, night)
	for next.Before(today) {
		next = nextOccurrence(rule, next)
	}
	return next
}

// nextOccurrence is the rule's first date after from, keeping from's weekday.
// Pure.
func nextOccurrence(rule repeatRule, from time.Time) time.Time {
	y, m, d := from.Date()
	if rule.Freq == repeatWeekly {
		return time.Date(y, m, d+7*int(rule.IntervalWeeks), 0, 0, 0, 0, time.UTC)
	}
	return weekdayInMonth(y, m+1, from.Weekday(), rule.WeekOfMonth)
}

// weekdayInMonth is the week-th wd of the month (time.Date normalizes a month
// past December), or its last one for lastWeekOfMonth. Pure.
func weekdayInMonth(y int, m time.Month, wd time.Weekday, week int16) time.Time {
	if week == lastWeekOfMonth {
		end := time.Date(y, m+1, 0, 0, 0, 0, 0, time.UTC)
		back := (int(end.Weekday()) - int(wd) + 7) % 7
		return end.AddDate(0, 0, -back)
	}
	first := time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
	ahead := (int(wd) - int(first.Weekday()) + 7) % 7
	return first.AddDate(0, 0, ahead+7*int(week-1))
}

// repeatDTO is a Night's repeat on the wire, or null when it doesn't repeat:
// {"freq": "weekly", "intervalWeeks": 1|2} or {"freq": "monthly", "week":
// 1–4|-1}, where -1 is the last of the Night's weekday in the month.
type repeatDTO struct {
	Freq          string `json:"freq"`
	IntervalWeeks *int16 `json:"intervalWeeks,omitempty"`
	Week          *int16 `json:"week,omitempty"`
}

// parseRepeat validates a wire repeat for a Night dated date; nil is no
// repeat. A monthly week must be the Night's own week of the month, or
// lastWeekOfMonth when the date is the month's last of its weekday, so the
// rule and the date can't disagree. Pure.
func parseRepeat(dto *repeatDTO, date time.Time) (*repeatRule, error) {
	if dto == nil {
		return nil, nil
	}
	switch repeatFreq(dto.Freq) {
	case repeatWeekly:
		if dto.Week != nil || dto.IntervalWeeks == nil || *dto.IntervalWeeks < 1 || *dto.IntervalWeeks > 2 {
			return nil, fmt.Errorf("invalid repeat: weekly takes an intervalWeeks of 1 or 2")
		}
		return &repeatRule{Freq: repeatWeekly, IntervalWeeks: *dto.IntervalWeeks}, nil
	case repeatMonthly:
		if dto.IntervalWeeks != nil || dto.Week == nil {
			return nil, fmt.Errorf("invalid repeat: monthly takes a week")
		}
		week := *dto.Week
		if (week < 1 || week > 4) && week != lastWeekOfMonth {
			return nil, fmt.Errorf("invalid repeat: week is 1–4, or -1 for the last")
		}
		if weekdayInMonth(date.Year(), date.Month(), date.Weekday(), week) != date {
			return nil, fmt.Errorf("invalid repeat: week %d doesn't match scheduledFor", week)
		}
		return &repeatRule{Freq: repeatMonthly, WeekOfMonth: week}, nil
	default:
		return nil, fmt.Errorf("invalid repeat freq")
	}
}

// toRepeatDTO is a rule as the wire carries it, nil when there is none. Pure.
func toRepeatDTO(rule *repeatRule) *repeatDTO {
	if rule == nil {
		return nil
	}
	dto := &repeatDTO{Freq: string(rule.Freq)}
	if rule.Freq == repeatWeekly {
		dto.IntervalWeeks = &rule.IntervalWeeks
	} else {
		dto.Week = &rule.WeekOfMonth
	}
	return dto
}

// repeatColumns is a rule as the nights repeat columns store it, all NULL for
// none. Pure.
func repeatColumns(rule *repeatRule) (db.NullRepeatFreq, pgtype.Int2, pgtype.Int2) {
	if rule == nil {
		return db.NullRepeatFreq{}, pgtype.Int2{}, pgtype.Int2{}
	}
	freq := db.NullRepeatFreq{RepeatFreq: rule.Freq, Valid: true}
	if rule.Freq == repeatWeekly {
		return freq, pgtype.Int2{Int16: rule.IntervalWeeks, Valid: true}, pgtype.Int2{}
	}
	return freq, pgtype.Int2{}, pgtype.Int2{Int16: rule.WeekOfMonth, Valid: true}
}

// repeatFromColumns reads the nights repeat columns back into a rule, nil when
// the Night doesn't repeat. The ck_night_repeat constraint keeps them
// consistent. Pure.
func repeatFromColumns(freq db.NullRepeatFreq, intervalWeeks, weekOfMonth pgtype.Int2) *repeatRule {
	if !freq.Valid {
		return nil
	}
	return &repeatRule{Freq: freq.RepeatFreq, IntervalWeeks: intervalWeeks.Int16, WeekOfMonth: weekOfMonth.Int16}
}
