// Copyright 2014 Team 254. All Rights Reserved.
// Author: pat@patfairbank.com (Patrick Fairbank)
//
// Functions for creating practice and qualification match schedules.

package tournament

import (
	"fmt"
	"math/rand"
	"sort"
	"time"

	"github.com/Team254/cheesy-arena/model"
)

const (
	TeamsPerAlliance = 2
	TeamsPerMatch    = TeamsPerAlliance * 2
)

// scheduleRandom is the source of randomness used to build schedules. It's a package-level variable (rather than
// calling math/rand's top-level functions directly) so that tests can substitute a seeded generator for
// deterministic, repeatable output.
var scheduleRandom = rand.New(rand.NewSource(time.Now().UnixNano()))

// matchAssignment holds the team indices (into the caller's teams slice) chosen for one match, plus which of those
// appearances (if any) are surrogates.
type matchAssignment struct {
	red1, red2, blue1, blue2                                     int
	red1Surrogate, red2Surrogate, blue1Surrogate, blue2Surrogate bool
}

// Creates a random schedule for the given parameters and returns it as a list of matches. The schedule is built
// directly using a balanced randomized algorithm (rather than loading a pre-generated template file), since events
// using this fork run two teams per alliance (four teams per match) instead of the traditional three-per-alliance
// FRC format that the template files were designed for.
func BuildRandomSchedule(
	teams []model.Team, scheduleBlocks []model.ScheduleBlock, matchType model.MatchType,
) ([]model.Match, error) {
	numTeams := len(teams)
	numMatches := countMatches(scheduleBlocks)

	if numTeams < TeamsPerMatch {
		return nil, fmt.Errorf(
			"need at least %d teams to build a schedule; only %d are registered", TeamsPerMatch, numTeams,
		)
	}
	if numMatches == 0 {
		return nil, fmt.Errorf("no matches were requested in the schedule blocks")
	}
	if matchType != model.Practice && matchType != model.Qualification {
		return nil, fmt.Errorf("invalid match type %q", matchType)
	}

	assignments := buildBalancedAssignments(numTeams, numMatches)

	matches := make([]model.Match, numMatches)
	for i, a := range assignments {
		matches[i].Type = matchType
		matches[i].TypeOrder = i + 1
		switch matchType {
		case model.Practice:
			matches[i].ShortName = fmt.Sprintf("P%d", i+1)
			matches[i].LongName = fmt.Sprintf("Practice %d", i+1)
			matches[i].TbaMatchKey.CompLevel = "p"
		case model.Qualification:
			matches[i].ShortName = fmt.Sprintf("Q%d", i+1)
			matches[i].LongName = fmt.Sprintf("Qualification %d", i+1)
			matches[i].TbaMatchKey.CompLevel = "qm"
		}

		matches[i].Red1 = teams[a.red1].Id
		matches[i].Red1IsSurrogate = a.red1Surrogate
		matches[i].Red2 = teams[a.red2].Id
		matches[i].Red2IsSurrogate = a.red2Surrogate
		matches[i].Red3 = 0
		matches[i].Red3IsSurrogate = false
		matches[i].Blue1 = teams[a.blue1].Id
		matches[i].Blue1IsSurrogate = a.blue1Surrogate
		matches[i].Blue2 = teams[a.blue2].Id
		matches[i].Blue2IsSurrogate = a.blue2Surrogate
		matches[i].Blue3 = 0
		matches[i].Blue3IsSurrogate = false
		matches[i].TbaMatchKey.MatchNumber = i + 1
	}

	// Fill in the match times.
	matchIndex := 0
	for _, block := range scheduleBlocks {
		for i := 0; i < block.NumMatches && matchIndex < numMatches; i++ {
			matches[matchIndex].Time = block.StartTime.Add(time.Duration(i*block.MatchSpacingSec) * time.Second)
			matchIndex++
		}
	}

	return matches, nil
}

// Returns the total number of matches that can be run within the given schedule blocks.
func countMatches(scheduleBlocks []model.ScheduleBlock) int {
	numMatches := 0
	for _, block := range scheduleBlocks {
		numMatches += block.NumMatches
	}
	return numMatches
}

// buildBalancedAssignments generates a schedule of team indices for the requested number of matches, using a
// greedy randomized algorithm that:
//   - Keeps the number of matches played as equal as possible across all teams (never differing by more than one).
//   - Minimizes how often the same two teams end up as alliance partners.
//   - Randomizes red/blue alliance assignment and pairings so the schedule isn't predictable or repetitive.
//
// If numMatches*TeamsPerMatch isn't evenly divisible by numTeams, some teams unavoidably play one extra match; that
// extra appearance is marked as a surrogate (matching standard FRC convention) so it doesn't count toward that
// team's qualification ranking.
func buildBalancedAssignments(numTeams, numMatches int) []matchAssignment {
	matchesPlayed := make([]int, numTeams)
	partnerCount := make([][]int, numTeams)
	for i := range partnerCount {
		partnerCount[i] = make([]int, numTeams)
	}

	assignments := make([]matchAssignment, numMatches)
	for m := 0; m < numMatches; m++ {
		four := pickFourLeastPlayed(numTeams, matchesPlayed)
		red1, red2, blue1, blue2 := splitIntoAlliances(four, partnerCount)

		assignments[m] = matchAssignment{red1: red1, red2: red2, blue1: blue1, blue2: blue2}

		matchesPlayed[red1]++
		matchesPlayed[red2]++
		matchesPlayed[blue1]++
		matchesPlayed[blue2]++
		partnerCount[red1][red2]++
		partnerCount[red2][red1]++
		partnerCount[blue1][blue2]++
		partnerCount[blue2][blue1]++
	}

	markSurrogates(assignments, matchesPlayed, numTeams, numMatches)

	return assignments
}

// pickFourLeastPlayed returns four distinct team indices, preferring whichever teams have played the fewest
// matches so far, with random tie-breaking so the schedule isn't deterministic run-to-run.
func pickFourLeastPlayed(numTeams int, matchesPlayed []int) [4]int {
	order := scheduleRandom.Perm(numTeams)
	sort.SliceStable(order, func(i, j int) bool {
		return matchesPlayed[order[i]] < matchesPlayed[order[j]]
	})
	return [4]int{order[0], order[1], order[2], order[3]}
}

// splitIntoAlliances splits four teams into two alliance pairs, choosing whichever of the three possible pairings
// results in the fewest repeat partnerships (teams who have already been alliance partners before), then randomly
// assigns the pairs to red/blue and randomizes the order within each pair.
func splitIntoAlliances(four [4]int, partnerCount [][]int) (red1, red2, blue1, blue2 int) {
	type pairing struct {
		a1, a2, b1, b2 int
	}
	pairings := []pairing{
		{four[0], four[1], four[2], four[3]},
		{four[0], four[2], four[1], four[3]},
		{four[0], four[3], four[1], four[2]},
	}

	best := pairings[0]
	bestScore := partnerCount[best.a1][best.a2] + partnerCount[best.b1][best.b2]
	for _, p := range pairings[1:] {
		score := partnerCount[p.a1][p.a2] + partnerCount[p.b1][p.b2]
		if score < bestScore {
			bestScore = score
			best = p
		}
	}

	pairs := [2][2]int{{best.a1, best.a2}, {best.b1, best.b2}}
	if scheduleRandom.Intn(2) == 0 {
		pairs[0], pairs[1] = pairs[1], pairs[0]
	}
	if scheduleRandom.Intn(2) == 0 {
		pairs[0][0], pairs[0][1] = pairs[0][1], pairs[0][0]
	}
	if scheduleRandom.Intn(2) == 0 {
		pairs[1][0], pairs[1][1] = pairs[1][1], pairs[1][0]
	}

	return pairs[0][0], pairs[0][1], pairs[1][0], pairs[1][1]
}

// markSurrogates flags the extra match appearance(s) for any team that ends up playing more matches than the even
// target, so those matches don't count toward qualification ranking. Extra appearances are placed on teams' later
// matches, which is the conventional placement for surrogates.
func markSurrogates(assignments []matchAssignment, matchesPlayed []int, numTeams, numMatches int) {
	targetPerTeam := (numMatches * TeamsPerMatch) / numTeams

	remainingExtra := make([]int, numTeams)
	for i := 0; i < numTeams; i++ {
		if matchesPlayed[i] > targetPerTeam {
			remainingExtra[i] = matchesPlayed[i] - targetPerTeam
		}
	}

	markIfExtra := func(team int, surrogate *bool) {
		if remainingExtra[team] > 0 {
			*surrogate = true
			remainingExtra[team]--
		}
	}

	for m := numMatches - 1; m >= 0; m-- {
		a := &assignments[m]
		markIfExtra(a.red1, &a.red1Surrogate)
		markIfExtra(a.red2, &a.red2Surrogate)
		markIfExtra(a.blue1, &a.blue1Surrogate)
		markIfExtra(a.blue2, &a.blue2Surrogate)
	}
}
