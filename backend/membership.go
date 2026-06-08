package main

import (
	"fmt"
	"math"
	"strings"
)

// joinRequest is the JSON body of POST /groups/{groupId}/members.
type joinRequest struct {
	Name string `json:"name"`
}

// validateJoinName trims and requires a non-empty member name. Pure.
func validateJoinName(req joinRequest) (string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", fmt.Errorf("name is required")
	}
	return name, nil
}

// seedBaseline computes the baseline_picks to stamp on a membership entering the
// rotation so its TOTAL served-count (baseline + existing credited picks) lands
// at the current active-core average. Pure; never negative. For a brand-new
// joiner (existingCredited == 0) this is exactly round(avg).
func seedBaseline(avgServed float64, existingCredited int32) int32 {
	seed := int32(math.Round(avgServed)) - existingCredited
	if seed < 0 {
		return 0
	}
	return seed
}
