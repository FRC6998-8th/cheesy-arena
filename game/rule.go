// Copyright 2020 Team 254. All Rights Reserved.
// Author: pat@patfairbank.com (Patrick Fairbank)
//
// Model of a game-specific rule.

package game

type Rule struct {
	Id             int
	RuleNumber     string
	IsMajor        bool
	IsRankingPoint bool
	Description    string
}

// All rules from the 2022 game that carry point penalties.
// @formatter:off
var rules = []*Rule{
	{1, "G201", true, false, "Dismantling or damaging an opponent robot by any means"},
	{2, "G202", true, false, "Intentionally or unintentionally overturning an opponent's robot"},
	{3, "G203", false, false, "Robot extensions touching another robot or entering its frame"},
	{4, "G204", false, false, "Pinning an opponent robot for more than 3 seconds"},
	{5, "G204", true, false, "Pinning an opponent robot not corrected for more than 3 seconds "},
	{6, "G205", false, false, "Colliding with an opponent robot in the Park Zone during Auto or Endgame"},
	{7, "G301", true, false, "Damaging the field by any means"},
	{8, "G302", false, false, "Crossing the centerline during Auto"},
	{9, "G303", true, false, "Colliding with an opponent robot in their alliance area during Auto."},
	{10, "G304", false, false, "Robot attempting to directly touch FUEL at the HUB exit"},
	{11, "G304", true, false, "Robot attempting to directly touch FUEL at the HUB exit deliberately or recklessly"},
	{12, "G305", true, false, "Shooting and scoring into the HUB from outside the area between the starting line and the driver station wall"},
	{13, "G306", true, false, "Robots can retrieve FUEL from the opponent's Depot. However, when an opponent robot is in its Depot, your robot must not collide with it"},
	{14, "G307", true, false, "No more than one robot from an alliance is allowed in the opponent's alliance area"},
	{14, "G501", true, false, "Delaying the match schedule"},
	{15, "G602", false, false, "Anyone other than the Human Player touching Game Pieces."},
	{17, "G603", false, false, "Human Player touching Game Pieces during AUTO or End Game"},
	{18, "G604", true, false, "Touching joysticks or laptops during Auto time"},
}

// @formatter:on
var ruleMap map[int]*Rule

// Returns the rule having the given ID, or nil if no such rule exists.
func GetRuleById(id int) *Rule {
	return GetAllRules()[id]
}

// Returns a slice of all defined rules that carry point penalties.
func GetAllRules() map[int]*Rule {
	if ruleMap == nil {
		ruleMap = make(map[int]*Rule, len(rules))
		for _, rule := range rules {
			ruleMap[rule.Id] = rule
		}
	}
	return ruleMap
}
