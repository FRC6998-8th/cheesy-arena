// Copyright 2026 Team 254. All Rights Reserved.

package web

import (
	"github.com/Team254/cheesy-arena/websocket"
	gorillawebsocket "github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestAudienceScoreDisplay(t *testing.T) {
	web := setupTestWeb(t)

	recorder := web.getHttpResponse("/displays/audience_score")
	assert.Equal(t, 302, recorder.Code)
	assert.Contains(t, recorder.Header().Get("Location"), "displayId=100")
	assert.Contains(t, recorder.Header().Get("Location"), "background=%23000")
	assert.Contains(t, recorder.Header().Get("Location"), "reversed=false")
	assert.Contains(t, recorder.Header().Get("Location"), "overlayLocation=center")
	assert.Contains(t, recorder.Header().Get("Location"), "topSpacingPx=0")
	assert.Contains(t, recorder.Header().Get("Location"), "zoomFactor=auto")

	recorder = web.getHttpResponse(
		"/displays/audience_score?displayId=1&background=%23fff&reversed=true&overlayLocation=bottom&topSpacingPx=10&zoomFactor=2",
	)
	assert.Equal(t, 200, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "Audience Score Display - Untitled Event - Cheesy Arena")
}

func TestAudienceScoreDisplayWebsocket(t *testing.T) {
	web := setupTestWeb(t)

	server, wsUrl := web.startTestServer()
	defer server.Close()
	conn, _, err := gorillawebsocket.DefaultDialer.Dial(wsUrl+"/displays/audience_score/websocket?displayId=1", nil)
	assert.Nil(t, err)
	defer conn.Close()
	ws := websocket.NewTestWebsocket(conn)

	readWebsocketType(t, ws, "displayConfiguration")
	readWebsocketType(t, ws, "matchTiming")
	readWebsocketType(t, ws, "audienceDisplayMode")
	readWebsocketType(t, ws, "matchLoad")
	readWebsocketType(t, ws, "matchTime")
	readWebsocketType(t, ws, "realtimeScore")

	web.arena.MatchLoadNotifier.Notify()
	readWebsocketType(t, ws, "matchLoad")
	web.arena.AllianceStations["R1"].Bypass = true
	web.arena.AllianceStations["R2"].Bypass = true
	web.arena.AllianceStations["R3"].Bypass = true
	web.arena.AllianceStations["B1"].Bypass = true
	web.arena.AllianceStations["B2"].Bypass = true
	web.arena.AllianceStations["B3"].Bypass = true
	web.arena.StartMatch()
	web.arena.Update()
	web.arena.Update()
	messages := readWebsocketMultiple(t, ws, 3)
	screen, ok := messages["audienceDisplayMode"]
	if assert.True(t, ok) {
		assert.Equal(t, "match", screen)
	}
	_, ok = messages["matchTime"]
	assert.True(t, ok)
	web.arena.RealtimeScoreNotifier.Notify()
	readWebsocketType(t, ws, "realtimeScore")
}
