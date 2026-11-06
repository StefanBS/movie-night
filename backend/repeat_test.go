package main

import (
	"testing"
	"time"
)

func TestNextSeriesDate(t *testing.T) {
	weekly := repeatRule{Freq: repeatWeekly, IntervalWeeks: 1}
	fortnightly := repeatRule{Freq: repeatWeekly, IntervalWeeks: 2}
	third := repeatRule{Freq: repeatMonthly, WeekOfMonth: 3}
	last := repeatRule{Freq: repeatMonthly, WeekOfMonth: lastWeekOfMonth}

	tests := []struct {
		name  string
		rule  repeatRule
		night string
		now   string // the server's clock, UTC
		want  string
	}{
		{name: "weekly: a week on", rule: weekly, night: "2026-06-19", now: "2026-06-19T21:00:00Z", want: "2026-06-26"},
		{name: "weekly: into the next year", rule: weekly, night: "2026-12-25", now: "2026-12-25T21:00:00Z", want: "2027-01-01"},
		{name: "weekly: recorded weeks late skips to the first ahead", rule: weekly, night: "2026-06-05", now: "2026-06-24T12:00:00Z", want: "2026-06-26"},
		{name: "weekly: late, landing on today's date", rule: weekly, night: "2026-06-05", now: "2026-06-26T12:00:00Z", want: "2026-06-26"},
		{name: "every 2 weeks", rule: fortnightly, night: "2026-06-19", now: "2026-06-19T21:00:00Z", want: "2026-07-03"},
		{name: "third Friday: next month", rule: third, night: "2026-06-19", now: "2026-06-19T21:00:00Z", want: "2026-07-17"},
		{name: "third Friday: into the next year", rule: third, night: "2026-12-18", now: "2026-12-18T21:00:00Z", want: "2027-01-15"},
		{name: "first Monday: month starting on a Monday", rule: repeatRule{Freq: repeatMonthly, WeekOfMonth: 1}, night: "2026-05-04", now: "2026-05-04T21:00:00Z", want: "2026-06-01"},
		{name: "last Friday: a month with five", rule: last, night: "2026-06-26", now: "2026-06-26T21:00:00Z", want: "2026-07-31"},
		{name: "last Friday: a month with four", rule: last, night: "2026-07-31", now: "2026-07-31T21:00:00Z", want: "2026-08-28"},
		{name: "third Friday: recorded months late", rule: third, night: "2026-03-20", now: "2026-06-25T12:00:00Z", want: "2026-07-17"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			now, err := time.Parse(time.RFC3339, tc.now)
			if err != nil {
				t.Fatal(err)
			}
			got := nextSeriesDate(tc.rule, mustDate(t, tc.night), now)
			if got.Format(time.DateOnly) != tc.want {
				t.Errorf("nextSeriesDate(%s) = %s, want %s", tc.night, got.Format(time.DateOnly), tc.want)
			}
		})
	}
}

func i16(n int16) *int16 { return &n }

func TestParseRepeat(t *testing.T) {
	tests := []struct {
		name    string
		dto     *repeatDTO
		date    string
		want    *repeatRule
		wantErr bool
	}{
		{name: "null doesn't repeat", dto: nil, date: "2026-06-19", want: nil},
		{name: "every week", dto: &repeatDTO{Freq: "weekly", IntervalWeeks: i16(1)}, date: "2026-06-19", want: &repeatRule{Freq: repeatWeekly, IntervalWeeks: 1}},
		{name: "every 2 weeks", dto: &repeatDTO{Freq: "weekly", IntervalWeeks: i16(2)}, date: "2026-06-19", want: &repeatRule{Freq: repeatWeekly, IntervalWeeks: 2}},
		{name: "weekly needs an interval", dto: &repeatDTO{Freq: "weekly"}, date: "2026-06-19", wantErr: true},
		{name: "weekly interval out of range", dto: &repeatDTO{Freq: "weekly", IntervalWeeks: i16(3)}, date: "2026-06-19", wantErr: true},
		{name: "weekly with a week of the month", dto: &repeatDTO{Freq: "weekly", IntervalWeeks: i16(1), Week: i16(3)}, date: "2026-06-19", wantErr: true},
		{name: "third Friday", dto: &repeatDTO{Freq: "monthly", Week: i16(3)}, date: "2026-06-19", want: &repeatRule{Freq: repeatMonthly, WeekOfMonth: 3}},
		{name: "fourth Friday that is also the last", dto: &repeatDTO{Freq: "monthly", Week: i16(4)}, date: "2026-06-26", want: &repeatRule{Freq: repeatMonthly, WeekOfMonth: 4}},
		{name: "last Friday, the fourth", dto: &repeatDTO{Freq: "monthly", Week: i16(-1)}, date: "2026-06-26", want: &repeatRule{Freq: repeatMonthly, WeekOfMonth: lastWeekOfMonth}},
		{name: "last Friday, the fifth", dto: &repeatDTO{Freq: "monthly", Week: i16(-1)}, date: "2026-07-31", want: &repeatRule{Freq: repeatMonthly, WeekOfMonth: lastWeekOfMonth}},
		{name: "monthly week doesn't match the date", dto: &repeatDTO{Freq: "monthly", Week: i16(2)}, date: "2026-06-19", wantErr: true},
		{name: "last, but not the last of the month", dto: &repeatDTO{Freq: "monthly", Week: i16(-1)}, date: "2026-06-19", wantErr: true},
		{name: "no fifth week", dto: &repeatDTO{Freq: "monthly", Week: i16(5)}, date: "2026-07-31", wantErr: true},
		{name: "monthly needs a week", dto: &repeatDTO{Freq: "monthly"}, date: "2026-06-19", wantErr: true},
		{name: "monthly with an interval", dto: &repeatDTO{Freq: "monthly", Week: i16(3), IntervalWeeks: i16(1)}, date: "2026-06-19", wantErr: true},
		{name: "unknown freq", dto: &repeatDTO{Freq: "daily"}, date: "2026-06-19", wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseRepeat(tc.dto, mustDate(t, tc.date))
			if (err != nil) != tc.wantErr {
				t.Fatalf("parseRepeat err = %v, wantErr %v", err, tc.wantErr)
			}
			if tc.wantErr {
				return
			}
			if (got == nil) != (tc.want == nil) || (got != nil && *got != *tc.want) {
				t.Errorf("parseRepeat = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestRepeatWire(t *testing.T) {
	// A rule goes out in the shape parseRepeat reads back.
	for _, rule := range []repeatRule{
		{Freq: repeatWeekly, IntervalWeeks: 2},
		{Freq: repeatMonthly, WeekOfMonth: 3},
		{Freq: repeatMonthly, WeekOfMonth: lastWeekOfMonth},
	} {
		date := mustDate(t, "2026-06-19")
		if rule.WeekOfMonth == lastWeekOfMonth {
			date = mustDate(t, "2026-06-26")
		}
		got, err := parseRepeat(toRepeatDTO(&rule), date)
		if err != nil || got == nil || *got != rule {
			t.Errorf("round trip of %+v = %+v, %v", rule, got, err)
		}
	}
	if toRepeatDTO(nil) != nil {
		t.Error("no rule should encode as null")
	}
}
