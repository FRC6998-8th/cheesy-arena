// Copyright 2026 Team 254. All Rights Reserved.
//
// Web handlers for a standalone display that shows only the audience score overlay.

package web

import (
	"github.com/Team254/cheesy-arena/model"
	"github.com/Team254/cheesy-arena/websocket"
	"net/http"
)

// Renders the audience score overlay without full-screen audience display content.
func (web *Web) audienceScoreDisplayHandler(w http.ResponseWriter, r *http.Request) {
	if !web.enforceDisplayConfiguration(
		w,
		r,
		map[string]string{
			"background":      "#000",
			"reversed":        "false",
			"overlayLocation": "center",
			"topSpacingPx":    "0",
			"zoomFactor":      "auto",
		},
	) {
		return
	}

	template, err := web.parseFiles("templates/audience_score_display.html")
	if err != nil {
		handleWebErr(w, err)
		return
	}

	data := struct {
		*model.EventSettings
	}{web.arena.EventSettings}
	err = template.ExecuteTemplate(w, "audience_score_display.html", data)
	if err != nil {
		handleWebErr(w, err)
		return
	}
}

// The websocket endpoint for the audience score display client to receive status updates.
func (web *Web) audienceScoreDisplayWebsocketHandler(w http.ResponseWriter, r *http.Request) {
	display, err := web.registerDisplay(r)
	if err != nil {
		handleWebErr(w, err)
		return
	}
	defer web.arena.MarkDisplayDisconnected(display.DisplayConfiguration.Id)

	ws, err := websocket.NewWebsocket(w, r)
	if err != nil {
		handleWebErr(w, err)
		return
	}
	defer closeWebsocket(ws)

	ws.HandleNotifiers(
		display.Notifier,
		web.arena.MatchTimingNotifier,
		web.arena.AudienceDisplayModeNotifier,
		web.arena.MatchLoadNotifier,
		web.arena.MatchTimeNotifier,
		web.arena.RealtimeScoreNotifier,
		web.arena.ReloadDisplaysNotifier,
	)
}
