package main

import "testing"

func intp(n int) *int { return &n }

func TestReleaseYear(t *testing.T) {
	tests := []struct {
		in   string
		want *int
	}{
		{"2021-10-22", intp(2021)},
		{"1984-12-14", intp(1984)},
		{"", nil},
		{"nope", nil},
		{"20", nil},
	}
	for _, tt := range tests {
		got := releaseYear(tt.in)
		if (got == nil) != (tt.want == nil) {
			t.Fatalf("releaseYear(%q) = %v, want %v", tt.in, got, tt.want)
		}
		if got != nil && *got != *tt.want {
			t.Errorf("releaseYear(%q) = %d, want %d", tt.in, *got, *tt.want)
		}
	}
}

func TestParseTMDBSearch(t *testing.T) {
	body := []byte(`{"results":[
		{"id":438631,"title":"Dune","release_date":"2021-10-22"},
		{"id":841,"title":"Dune","release_date":"1984-12-14"},
		{"id":99,"title":"No Date","release_date":""}
	]}`)
	got, err := parseTMDBSearch(body)
	if err != nil {
		t.Fatalf("parseTMDBSearch: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	if got[0].TMDBID != 438631 || got[0].Title != "Dune" || got[0].ReleaseYear == nil || *got[0].ReleaseYear != 2021 {
		t.Errorf("[0] = %+v", got[0])
	}
	if got[2].ReleaseYear != nil {
		t.Errorf("[2] release year = %v, want nil", got[2].ReleaseYear)
	}
}

func TestParseTMDBMovie(t *testing.T) {
	got, err := parseTMDBMovie([]byte(`{"id":438631,"title":"Dune","release_date":"2021-10-22"}`))
	if err != nil {
		t.Fatalf("parseTMDBMovie: %v", err)
	}
	if got.TMDBID != 438631 || got.Title != "Dune" || got.ReleaseYear == nil || *got.ReleaseYear != 2021 {
		t.Errorf("got %+v", got)
	}
}
