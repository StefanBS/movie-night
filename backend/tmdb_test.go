package main

import (
	"slices"
	"testing"
)

func intp(n int32) *int32 { return &n }

func TestPosterURL(t *testing.T) {
	full := "https://image.tmdb.org/t/p/w342/abc.jpg"
	tests := []struct {
		name string
		in   string
		want *string
	}{
		{name: "path builds a full w342 url", in: "/abc.jpg", want: &full},
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

func TestParseTMDBMovieDetails(t *testing.T) {
	tests := []struct {
		name        string
		body        string
		wantGenres  []string
		wantRuntime *int32
	}{
		{
			name:        "genres in TMDB order and runtime in minutes",
			body:        `{"id":843,"title":"In the Mood for Love","genres":[{"id":18,"name":"Drama"},{"id":10749,"name":"Romance"}],"runtime":98}`,
			wantGenres:  []string{"Drama", "Romance"},
			wantRuntime: intp(98),
		},
		{
			name:        "runtime 0 is unknown",
			body:        `{"id":1,"title":"A","genres":[],"runtime":0}`,
			wantGenres:  []string{},
			wantRuntime: nil,
		},
		{
			name:        "null runtime is unknown",
			body:        `{"id":1,"title":"A","genres":null,"runtime":null}`,
			wantGenres:  []string{},
			wantRuntime: nil,
		},
		{
			name:        "missing genres and runtime",
			body:        `{"id":1,"title":"A"}`,
			wantGenres:  []string{},
			wantRuntime: nil,
		},
		{
			name:        "negative runtime is unknown",
			body:        `{"id":1,"title":"A","runtime":-5}`,
			wantGenres:  []string{},
			wantRuntime: nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseTMDBMovie([]byte(tt.body))
			if err != nil {
				t.Fatalf("parseTMDBMovie: %v", err)
			}
			if got.Genres == nil {
				t.Fatalf("genres = nil, want non-nil %v", tt.wantGenres)
			}
			if !slices.Equal(got.Genres, tt.wantGenres) {
				t.Errorf("genres = %v, want %v", got.Genres, tt.wantGenres)
			}
			if (got.RuntimeMinutes == nil) != (tt.wantRuntime == nil) ||
				(got.RuntimeMinutes != nil && *got.RuntimeMinutes != *tt.wantRuntime) {
				t.Errorf("runtime = %v, want %v", got.RuntimeMinutes, tt.wantRuntime)
			}
		})
	}
}

func TestToMovieResultsDetails(t *testing.T) {
	// Search hits carry only genre ids and no runtime, so the DTO always has
	// genres [] (never null) and runtimeMinutes null.
	got := toMovieResults([]movieResult{{TMDBID: 1, Title: "A"}})
	if got[0].Genres == nil || len(got[0].Genres) != 0 {
		t.Errorf("genres = %#v, want []", got[0].Genres)
	}
	if got[0].RuntimeMinutes != nil {
		t.Errorf("runtime = %v, want nil", got[0].RuntimeMinutes)
	}
}
