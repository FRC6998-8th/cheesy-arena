// Copyright 2014 Team 254. All Rights Reserved.
// Author: pat@patfairbank.com (Patrick Fairbank)

package tournament

import (
	"github.com/Team254/cheesy-arena/model"
	"github.com/stretchr/testify/assert"
	"math/rand"
	"testing"
	"time"
)

func TestNotEnoughTeams(t *testing.T) {
	teams := make([]model.Team, 3)
	scheduleBlocks := []model.ScheduleBlock{{0, model.Practice, time.Unix(0, 0).UTC(), 2, 60}}
	_, err := BuildRandomSchedule(teams, scheduleBlocks, model.Practice)
	expectedErr := "need at least 4 teams to build a schedule; only 3 are registered"
	if assert.NotNil(t, err) {
		assert.Equal(t, expectedErr, err.Error())
	}
}

func TestNoMatchesRequested(t *testing.T) {
	teams := make([]model.Team, 8)
	_, err := BuildRandomSchedule(teams, nil, model.Practice)
	if assert.NotNil(t, err) {
		assert.Equal(t, "no matches were requested in the schedule blocks", err.Error())
	}
}

func TestInvalidMatchType(t *testing.T) {
	teams := make([]model.Team, 8)
	scheduleBlocks := []model.ScheduleBlock{{0, model.Playoff, time.Unix(0, 0).UTC(), 2, 60}}
	_, err := BuildRandomSchedule(teams, scheduleBlocks, model.Playoff)
	if assert.NotNil(t, err) {
		assert.Contains(t, err.Error(), "invalid match type")
	}
}

func TestScheduleTeams(t *testing.T) {
	scheduleRandom = rand.New(rand.NewSource(0))

	numTeams := 8
	teams := make([]model.Team, numTeams)
	teamIds := make(map[int]bool)
	for i := 0; i < numTeams; i++ {
		teams[i].Id = i + 101
		teamIds[teams[i].Id] = true
	}
	scheduleBlocks := []model.ScheduleBlock{{0, model.Practice, time.Unix(0, 0).UTC(), 10, 60}}
	matches, err := BuildRandomSchedule(teams, scheduleBlocks, model.Practice)
	assert.Nil(t, err)
	assert.Equal(t, 10, len(matches))

	matchesPlayed := make(map[int]int)
	for i, match := range matches {
		assert.Equal(t, model.Practice, match.Type)
		assert.Equal(t, i+1, match.TypeOrder)
		assert.Equal(t, "p", match.TbaMatchKey.CompLevel)

		// Red3/Blue3 should always be empty since this event runs two teams per alliance.
		assert.Equal(t, 0, match.Red3)
		assert.Equal(t, 0, match.Blue3)
		assert.False(t, match.Red3IsSurrogate)
		assert.False(t, match.Blue3IsSurrogate)

		// All four teams in the match should be real, distinct teams.
		matchTeams := []int{match.Red1, match.Red2, match.Blue1, match.Blue2}
		seen := make(map[int]bool)
		for _, teamId := range matchTeams {
			assert.True(t, teamIds[teamId], "team %d is not a registered team", teamId)
			assert.False(t, seen[teamId], "team %d appears twice in match %d", teamId, i+1)
			seen[teamId] = true
			matchesPlayed[teamId]++
		}
	}

	// Every team should have played a roughly equal number of matches (never differing by more than one).
	minPlayed, maxPlayed := -1, -1
	for _, count := range matchesPlayed {
		if minPlayed == -1 || count < minPlayed {
			minPlayed = count
		}
		if count > maxPlayed {
			maxPlayed = count
		}
	}
	assert.LessOrEqual(t, maxPlayed-minPlayed, 1)

	// Check with qualification matches.
	scheduleRandom = rand.New(rand.NewSource(0))
	scheduleBlocks = []model.ScheduleBlock{{0, model.Qualification, time.Unix(0, 0).UTC(), 10, 60}}
	matches, err = BuildRandomSchedule(teams, scheduleBlocks, model.Qualification)
	assert.Nil(t, err)
	assert.Equal(t, "Q1", matches[0].ShortName)
	assert.Equal(t, "Qualification 1", matches[0].LongName)
	assert.Equal(t, "qm", matches[0].TbaMatchKey.CompLevel)
}

func TestScheduleTiming(t *testing.T) {
	teams := make([]model.Team, 18)
	scheduleBlocks := []model.ScheduleBlock{
		{0, model.Qualification, time.Unix(100, 0).UTC(), 10, 75},
		{0, model.Qualification, time.Unix(20000, 0).UTC(), 5, 1000},
		{0, model.Qualification, time.Unix(100000, 0).UTC(), 15, 29},
	}
	matches, err := BuildRandomSchedule(teams, scheduleBlocks, model.Qualification)
	assert.Nil(t, err)
	assert.Equal(t, time.Unix(100, 0).UTC(), matches[0].Time)
	assert.Equal(t, time.Unix(775, 0).UTC(), matches[9].Time)
	assert.Equal(t, time.Unix(20000, 0).UTC(), matches[10].Time)
	assert.Equal(t, time.Unix(24000, 0).UTC(), matches[14].Time)
	assert.Equal(t, time.Unix(100000, 0).UTC(), matches[15].Time)
	assert.Equal(t, time.Unix(100406, 0).UTC(), matches[29].Time)
}

func TestScheduleSurrogates(t *testing.T) {
	scheduleRandom = rand.New(rand.NewSource(0))

	numTeams := 9
	teams := make([]model.Team, numTeams)
	for i := 0; i < numTeams; i++ {
		teams[i].Id = i + 101
	}
	// 9 teams * 10 matches isn't evenly divisible by 4 teams/match, so some teams must play an extra match.
	numMatches := 10
	scheduleBlocks := []model.ScheduleBlock{{0, model.Qualification, time.Unix(0, 0).UTC(), numMatches, 60}}
	matches, err := BuildRandomSchedule(teams, scheduleBlocks, model.Qualification)
	assert.Nil(t, err)

	targetPerTeam := (numMatches * TeamsPerMatch) / numTeams
	expectedSurrogateCount := numMatches*TeamsPerMatch - targetPerTeam*numTeams

	matchesPlayed := make(map[int]int)
	surrogateCount := 0
	for _, match := range matches {
		if match.Red1IsSurrogate {
			surrogateCount++
		}
		if match.Red2IsSurrogate {
			surrogateCount++
		}
		if match.Blue1IsSurrogate {
			surrogateCount++
		}
		if match.Blue2IsSurrogate {
			surrogateCount++
		}
		matchesPlayed[match.Red1]++
		matchesPlayed[match.Red2]++
		matchesPlayed[match.Blue1]++
		matchesPlayed[match.Blue2]++
	}

	assert.Equal(t, expectedSurrogateCount, surrogateCount)
	for teamId, count := range matchesPlayed {
		if count > targetPerTeam {
			assert.Equal(t, targetPerTeam+1, count, "team %d played an unexpected number of matches", teamId)
		}
	}
}
