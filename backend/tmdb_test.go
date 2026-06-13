package main

import "testing"

func intp(n int32) *int32 { return &n }

func strp(s string) *string { return &s }

func TestPosterURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want *string
	}{
		{name: "path builds a full w342 url", in: "/abc.jpg", want: strp("https://image.tmdb.org/t/p/w342/abc.jpg")},
		{name: "empty string returns nil", in: "", want: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := posterURL(tt.in)
			if (got == nil) != (tt.want == nil) {
				t.Fatalf("posterURL(%q) = %v, want %v", tt.in, got, tt.want)
			}
			if got != nil && *got != *tt.want {
				t.Errorf("posterURL(%q) = %q, want %q", tt.in, *got, *tt.want)
			}
		})
	}
}

func TestReleaseYear(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want *int32
	}{
		{name: "valid date returns 2021", in: "2021-10-22", want: intp(2021)},
		{name: "valid date returns 1984", in: "1984-12-14", want: intp(1984)},
		{name: "empty string returns nil", in: "", want: nil},
		{name: "non-numeric prefix returns nil", in: "nope", want: nil},
		{name: "too-short string returns nil", in: "20", want: nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := releaseYear(tt.in)
			if (got == nil) != (tt.want == nil) {
				t.Errorf("releaseYear(%q) = %v, want %v", tt.in, got, tt.want)
				return
			}
			if got != nil && *got != *tt.want {
				t.Errorf("releaseYear(%q) = %d, want %d", tt.in, *got, *tt.want)
			}
		})
	}
}

func TestParseTMDBSearch(t *testing.T) {
	t.Run("valid body decodes results", func(t *testing.T) {
		body := []byte(`{"results":[
			{"id":438631,"title":"Dune","release_date":"2021-10-22","poster_path":"/dune.jpg"},
			{"id":841,"title":"Dune","release_date":"1984-12-14","poster_path":"/dune84.jpg"},
			{"id":99,"title":"No Date","release_date":"","poster_path":""}
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
		if got[0].PosterPath != "/dune.jpg" {
			t.Errorf("[0] poster = %q, want /dune.jpg", got[0].PosterPath)
		}
		if got[2].PosterPath != "" {
			t.Errorf("[2] poster = %q, want empty", got[2].PosterPath)
		}
	})

	t.Run("malformed JSON returns error", func(t *testing.T) {
		_, err := parseTMDBSearch([]byte("not-json"))
		if err == nil {
			t.Error("parseTMDBSearch(malformed): expected non-nil error, got nil")
		}
	})
}

func TestParseTMDBMovie(t *testing.T) {
	t.Run("valid body decodes movie", func(t *testing.T) {
		got, err := parseTMDBMovie([]byte(`{"id":438631,"title":"Dune","release_date":"2021-10-22","poster_path":"/dune.jpg"}`))
		if err != nil {
			t.Fatalf("parseTMDBMovie: %v", err)
		}
		if got.TMDBID != 438631 || got.Title != "Dune" || got.ReleaseYear == nil || *got.ReleaseYear != 2021 {
			t.Errorf("got %+v", got)
		}
		if got.PosterPath != "/dune.jpg" {
			t.Errorf("poster = %q, want /dune.jpg", got.PosterPath)
		}
	})

	t.Run("malformed JSON returns error", func(t *testing.T) {
		_, err := parseTMDBMovie([]byte("not-json"))
		if err == nil {
			t.Error("parseTMDBMovie(malformed): expected non-nil error, got nil")
		}
	})
}
