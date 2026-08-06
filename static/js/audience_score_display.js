// Copyright 2026 Team 254. All Rights Reserved.
//
// Client-side methods for the audience score display.

if (typeof DisplayShared === "undefined") {
  $.ajax({ async: false, cache: true, dataType: "script", url: "/static/js/display_shared.js" });
}

var websocket;
let transitionMap;
const transitionQueue = [];
let transitionInProgress = false;
let currentScreen = "blank";
let redSide;
let blueSide;
let currentMatch;
let displayUrlParams;
let liveGraphic;
const hubActiveController = DisplayShared.createHubActiveController(function () {
  return currentScreen;
});

const eventMatchInfoDown = "30px";
const eventMatchInfoUp = $("#eventMatchInfo").css("height");
const logoUp = "35px";
const logoDown = $("#logo").css("top");
const scoreIn = $(".score").css("width");
const scoreMid = "185px";
const scoreOut = "400px";
const scoreFieldsOut = "180px";
const timeoutDetailsIn = $("#timeoutDetails").css("width");
const timeoutDetailsOut = "570px";
const scoreLogoTop = "-530px";

const updateFullScreenScale = function () {
  const scaleWrapper = $("#scaleWrapper");
  const zoomParam = displayUrlParams.get("zoomFactor");
  let userMultiplier = 1;
  if (zoomParam && zoomParam !== "auto") {
    userMultiplier = parseFloat(zoomParam) || 1;
  }

  scaleWrapper.css("transform", "none");
  const rect = scaleWrapper[0].getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return;
  }

  const padding = 0.02;
  const availableWidth = window.innerWidth * (1 - padding * 2);
  const availableHeight = window.innerHeight * (1 - padding * 2);
  const scale = Math.min(availableWidth / rect.width, availableHeight / rect.height) * userMultiplier;
  scaleWrapper.css("transform", `scale(${scale})`);
};

const showOverlay = function (callback) {
  const overlayCentering = $("#overlayCentering");
  if (overlayCentering.attr("data-visible") === "true") {
    if (callback) {
      callback();
    }
    return;
  }
  overlayCentering.attr("data-visible", "true");
  overlayCentering.transition({ queue: false, opacity: 1 }, 500, "ease", callback);
};

const hideOverlay = function (callback) {
  const overlayCentering = $("#overlayCentering");
  if (overlayCentering.attr("data-visible") !== "true") {
    if (callback) {
      callback();
    }
    return;
  }
  overlayCentering.transition({ queue: false, opacity: 0 }, 500, "ease", function () {
    overlayCentering.attr("data-visible", "false");
    if (callback) {
      callback();
    }
  });
};

const handleAudienceDisplayMode = function (targetScreen) {
  if (targetScreen === "logoLuma") {
    targetScreen = "logo";
  }
  if (targetScreen === "blank" && currentScreen === "match") {
    // Keep live scores visible after time expires until the score screen animation starts.
    return;
  }
  if (
    targetScreen !== "intro" &&
    targetScreen !== "match" &&
    targetScreen !== "score" &&
    targetScreen !== "timeout"
  ) {
    targetScreen = "blank";
  }

  document.body.dataset.audienceMode = targetScreen;

  transitionQueue.push(targetScreen);
  executeTransitionQueue();
};

const executeTransitionQueue = function () {
  if (transitionInProgress) {
    return;
  }

  if (transitionQueue.length > 0) {
    transitionInProgress = true;
    const targetScreen = transitionQueue.shift();
    const callback = function () {
      currentScreen = targetScreen;
      transitionInProgress = false;
      updateFullScreenScale();
      setTimeout(executeTransitionQueue, 100);
    };

    if (targetScreen === currentScreen) {
      callback();
      return;
    }

    let transitions = transitionMap[currentScreen][targetScreen];
    if (transitions !== undefined) {
      transitions(callback);
    } else {
      transitionMap[currentScreen]["blank"](function () {
        transitionMap["blank"][targetScreen](callback);
      });
    }
  }
};

const handleMatchLoad = function (data) {
  currentMatch = DisplayShared.handleMatchLoad(data, redSide, blueSide);
};

const handleMatchTime = function (data) {
  DisplayShared.handleMatchTime(data);
};

const handleRealtimeScore = function (data) {
  DisplayShared.handle2026RealtimeScore(
    data,
    currentMatch,
    redSide,
    blueSide,
    hubActiveController.updateHubActiveIndicator
  );
};

const rankingPointIconUrl = function (type, state) {
  return `/static/img/rp/${state}-${type}.png`;
};

const setFinalRankingPointIcons = function (side, scoreSummary, won, tied) {
  const icons = [
    ["energized", scoreSummary.EnergizedBonusRankingPoint],
    ["supercharged", scoreSummary.SuperchargedBonusRankingPoint],
    ["traversal", scoreSummary.TraversalBonusRankingPoint],
    ["win", won || tied],
    ["win", won],
    ["win", won],
  ];
  const iconHtml = icons.map(function ([type, earned]) {
    const state = earned ? (side === redSide ? "redSide" : "blueSide") : "no";
    return `<img class="final-ranking-point-icon" src="${rankingPointIconUrl(type, state)}" alt="${type} RP"/>`;
  }).join("");
  $(`#${side}FinalRankingPointIcons`).html(iconHtml);
};

const setFinalResultIndicator = function (side, label, result) {
  const indicator = $(`#${side}FinalResultIndicator`);
  indicator.text(label);
  indicator.attr("data-result", result);
};

const setTeamInfo = function (side, position, teamId, cards, rankings) {
  $(`#${side}FinalTeam${position}`).text(teamId).toggle(teamId > 0);
  $(`#${side}FinalTeam${position}Avatar`).attr("src", DisplayShared.getAvatarUrl(teamId)).toggle(teamId > 0);
  $(`#${side}FinalTeam${position}Card`).attr("data-card", cards[teamId.toString()] || "");

  const ranking = rankings[teamId];
  const rankNumber = ranking !== undefined && ranking !== null ? ranking.Rank : "";
  let rankIndicator = "";
  if (ranking !== undefined && ranking !== null && ranking.Rank !== 0) {
    if (ranking.Rank > ranking.PreviousRank && ranking.PreviousRank > 0) {
      rankIndicator = "rank-down";
    } else if (ranking.Rank < ranking.PreviousRank) {
      rankIndicator = "rank-up";
    }
  }
  $(`#${side}FinalTeam${position}RankIndicator`)
    .attr("src", rankIndicator === "" ? "" : `/static/img/${rankIndicator}.svg`)
    .toggle(rankIndicator !== "" && teamId > 0);
  $(`#${side}FinalTeam${position}RankNumber`).text(rankNumber).toggle(teamId > 0);
};

const handleScorePosted = function (data) {
  const tied = !data.RedWon && !data.BlueWon;
  liveGraphic = data.RedWon ?
    { source: "/static/img/live%20graphics/red.gif", durationMs: 6040 } :
    data.BlueWon ?
      { source: "/static/img/live%20graphics/blue.gif", durationMs: 4000 } :
      { source: "/static/img/live%20graphics/tie.gif", durationMs: 5900 };

  if (data.RedWon) {
    setFinalResultIndicator(redSide, "WINNER", "winner");
    setFinalResultIndicator(blueSide, "", "");
  } else if (data.BlueWon) {
    setFinalResultIndicator(redSide, "", "");
    setFinalResultIndicator(blueSide, "WINNER", "winner");
  } else {
    setFinalResultIndicator(redSide, "TIE", "tie");
    setFinalResultIndicator(blueSide, "TIE", "tie");
  }
  $("#finalTiebreakReason").text(data.TiebreakReason || "").attr("data-visible", data.TiebreakReason !== "");

  [[redSide, data.RedScoreSummary, data.Match.Red1, data.Match.Red2, data.RedCards, data.RedRankings, data.RedWon, data.RedDestination, data.RedWins, data.Match.PlayoffRedAlliance],
  [blueSide, data.BlueScoreSummary, data.Match.Blue1, data.Match.Blue2, data.BlueCards, data.BlueRankings, data.BlueWon, data.BlueDestination, data.BlueWins, data.Match.PlayoffBlueAlliance]]
    .forEach(function ([side, summary, team1, team2, cards, rankings, won, destination, wins, alliance]) {
      $(`#${side}FinalScore`).text(summary.Score);
      $(`#${side}FinalAlliance`).text("Alliance " + alliance);
      setTeamInfo(side, 1, team1, cards, rankings);
      setTeamInfo(side, 2, team2, cards, rankings);
      $(`#${side}FinalAutoFuelPoints`).text(summary.AutoFuelPoints);
      $(`#${side}FinalAutoTowerPoints`).text(summary.AutoTowerPoints);
      $(`#${side}FinalTeleopFuelPoints`).text(summary.TeleopFuelPoints);
      $(`#${side}FinalTeleopTowerPoints`).text(summary.TeleopTowerPoints);
      $(`#${side}FinalFoulPoints`).text(summary.FoulPoints);
      setFinalRankingPointIcons(side, summary, won, tied);
      $(`#${side}FinalWins`).text(wins);
      const destinationElement = $(`#${side}FinalDestination`);
      destinationElement.html(destination.replace("Advances to ", "Advances to<br>"));
      destinationElement.toggle(destination !== "").attr("data-won", won);
    });

  let matchName = data.Match.LongName;
  if (data.Match.NameDetail !== "") {
    matchName += " &ndash; " + data.Match.NameDetail;
  }
  $("#finalMatchName").html(matchName);
  if (data.Match.Type === matchTypePlayoff) {
    $(".playoff-hidden-field").hide();
    $(".playoff-only-field").show();
  } else {
    $(".playoff-hidden-field").show();
    $(".playoff-only-field").hide();
  }
};

const handlePlaySound = function (sound) {
  $("audio").each(function (k, audio) {
    audio.pause();
    audio.currentTime = 0;
  });
  const audio = $("#sound-" + sound)[0];
  if (audio) {
    audio.play();
  }
};

const showFinalScore = function (callback, onLiveGraphicStart) {
  const showScore = function () {
    $("#finalScore").show().transition({ queue: false, opacity: 1 }, 1000, "ease", callback);
  };
  if (liveGraphic === undefined) {
    setTimeout(function () {
      if (onLiveGraphicStart) {
        onLiveGraphicStart();
      }
      showScore();
    }, 250);
    return;
  }
  const graphic = $("#liveGraphic");
  const image = $("#liveGraphicImage");
  image.one("load", function () {
    if (onLiveGraphicStart) {
      onLiveGraphicStart();
    }
    graphic.show().transition({ queue: false, opacity: 1 }, 150, "linear");
    setTimeout(function () {
      graphic.transition({ queue: false, opacity: 0 }, 250, "linear", function () {
        graphic.hide();
        showScore();
      });
    }, liveGraphic.durationMs);
  });
  image.one("error", function () {
    if (onLiveGraphicStart) {
      onLiveGraphicStart();
    }
    showScore();
  });
  image.attr("src", `${liveGraphic.source}?v=${Date.now()}`);
};

const showScoreBackground = function () {
  $(".blinds.left").addClass("full").css("left", 0);
  $(".blinds.right").hide();
  $(".blindsCenter.full").css({ rotateY: "0deg", top: scoreLogoTop, scale: 1 });
};

const hideScoreBackground = function () {
  $(".blindsCenter.full").css({ top: 0, rotateY: "-180deg" });
  $(".blinds.left").removeClass("full").css("left", "-50%");
  $(".blinds.right").show().css("right", "-50%");
};

const transitionBlankToIntro = function (callback) {
  hideScoreBackground();
  showOverlay(function () {
    $(".teams").css("display", "flex");
    $(".avatars").css("display", "flex");
    $(".avatars").css("opacity", 1);
    $(".score").transition({ queue: false, width: scoreMid }, 500, "ease", function () {
      $("#eventMatchInfo").css("display", "flex");
      $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoDown }, 500, "ease", callback);
    });
  });
};

const transitionBlankToMatch = function (callback) {
  hideScoreBackground();
  showOverlay(function () {
    $(".teams").css("display", "flex");
    $(".score-fields").css("display", "flex");
    $(".score-fields").transition({ queue: false, width: scoreFieldsOut }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoUp }, 500, "ease");
    $(".score").transition({ queue: false, width: scoreOut }, 500, "ease", function () {
      $("#eventMatchInfo").css("display", "flex");
      $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoDown }, 500, "ease", callback);
      $(".score-number").transition({ queue: false, opacity: 1 }, 750, "ease");
      $("#matchTime").transition({ queue: false, opacity: 1 }, 750, "ease");
      $(".score-fields").transition({ queue: false, opacity: 1 }, 750, "ease");
      hubActiveController.restartPendingHubActiveIndicators();
    });
  });
};

const transitionBlankToScore = function (callback) {
  $(".blindsCenter.blank").css({ rotateY: "0deg" });
  $(".blindsCenter.full").css({ rotateY: "-180deg" });
  $(".blinds.right").transition({ queue: false, right: 0 }, 1000, "ease");
  $(".blinds.left").transition({ queue: false, left: 0 }, 1000, "ease", function () {
    $(".blinds.left").addClass("full");
    $(".blinds.right").hide();
    setTimeout(function () {
      $(".blindsCenter.blank").transition({ queue: false, rotateY: "180deg" }, 500, "ease");
      $(".blindsCenter.full").transition({ queue: false, rotateY: "0deg" }, 500, "ease", function () {
        showScoreBackground();
        showFinalScore(callback);
      });
    }, 200);
  });
};

const transitionBlankToTimeout = function (callback) {
  hideScoreBackground();
  showOverlay(function () {
    $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsOut }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoUp }, 500, "ease", function () {
      $(".timeout-detail").transition({ queue: false, opacity: 1 }, 750, "ease");
      $("#matchTime").transition({ queue: false, opacity: 1 }, 750, "ease", callback);
    });
  });
};

const transitionIntroToBlank = function (callback) {
  $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoUp }, 500, "ease", function () {
    $("#eventMatchInfo").hide();
    $(".score").transition({ queue: false, width: scoreIn }, 500, "ease", function () {
      $(".avatars").css("opacity", 0);
      $(".avatars").hide();
      $(".teams").hide();
      hideOverlay(callback);
    });
  });
};

const transitionIntroToMatch = function (callback) {
  $(".avatars").transition({ queue: false, opacity: 0 }, 500, "ease", function () {
    $(".avatars").hide();
  });
  $(".score-fields").css("display", "flex");
  $(".score-fields").transition({ queue: false, width: scoreFieldsOut }, 500, "ease");
  $("#logo").transition({ queue: false, top: logoUp }, 500, "ease");
  $(".score").transition({ queue: false, width: scoreOut }, 500, "ease", function () {
    $(".score-number").transition({ queue: false, opacity: 1 }, 750, "ease");
    $("#matchTime").transition({ queue: false, opacity: 1 }, 750, "ease", callback);
    $(".score-fields").transition({ queue: false, opacity: 1 }, 750, "ease");
    hubActiveController.restartPendingHubActiveIndicators();
  });
};

const transitionIntroToTimeout = function (callback) {
  $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoUp }, 500, "ease", function () {
    $("#eventMatchInfo").hide();
    $(".score").transition({ queue: false, width: scoreIn }, 500, "ease", function () {
      $(".avatars").css("opacity", 0);
      $(".avatars").hide();
      $(".teams").hide();
      $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsOut }, 500, "ease");
      $("#logo").transition({ queue: false, top: logoUp }, 500, "ease", function () {
        $(".timeout-detail").transition({ queue: false, opacity: 1 }, 750, "ease");
        $("#matchTime").transition({ queue: false, opacity: 1 }, 750, "ease", callback);
      });
    });
  });
};

const transitionMatchToBlank = function (callback) {
  $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoUp }, 500, "ease");
  $("#matchTime").transition({ queue: false, opacity: 0 }, 300, "linear");
  $(".score-fields").transition({ queue: false, opacity: 0 }, 300, "ease");
  $(".score-number").transition({ queue: false, opacity: 0 }, 300, "linear", function () {
    $("#eventMatchInfo").hide();
    $(".score-fields").transition({ queue: false, width: 0 }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoDown }, 500, "ease");
    $(".score").transition({ queue: false, width: scoreIn }, 500, "ease", function () {
      $(".teams").hide();
      $(".score-fields").hide();
      hideOverlay(callback);
    });
  });
};

const transitionMatchToIntro = function (callback) {
  $(".score-number").transition({ queue: false, opacity: 0 }, 300, "linear");
  $(".score-fields").transition({ queue: false, opacity: 0 }, 300, "ease");
  $("#matchTime").transition({ queue: false, opacity: 0 }, 300, "linear", function () {
    $(".score-fields").transition({ queue: false, width: 0 }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoDown }, 500, "ease");
    $(".score").transition({ queue: false, width: scoreMid }, 500, "ease", function () {
      $(".score-fields").hide();
      $(".avatars").css("display", "flex");
      $(".avatars").transition({ queue: false, opacity: 1 }, 500, "ease", callback);
    });
  });
};

const transitionScoreToBlank = function (callback) {
  $("#liveGraphic").hide().css("opacity", 0);
  $("#finalScore").transition({ queue: false, opacity: 0 }, 500, "ease", function () {
    $("#finalScore").hide();
    callback();
  });
};

const transitionMatchToScore = function (callback) {
  showScoreBackground();
  showFinalScore(callback, function () {
    hideOverlay();
  });
};

const transitionTimeoutToBlank = function (callback) {
  $(".timeout-detail").transition({ queue: false, opacity: 0 }, 300, "linear");
  $("#matchTime").transition({ queue: false, opacity: 0 }, 300, "linear", function () {
    $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsIn }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoDown }, 500, "ease", function () {
      hideOverlay(callback);
    });
  });
};

const transitionTimeoutToIntro = function (callback) {
  $(".timeout-detail").transition({ queue: false, opacity: 0 }, 300, "linear");
  $("#matchTime").transition({ queue: false, opacity: 0 }, 300, "linear", function () {
    $("#timeoutDetails").transition({ queue: false, width: timeoutDetailsIn }, 500, "ease");
    $("#logo").transition({ queue: false, top: logoDown }, 500, "ease", function () {
      $(".avatars").css("display", "flex");
      $(".avatars").css("opacity", 1);
      $(".teams").css("display", "flex");
      $(".score").transition({ queue: false, width: scoreMid }, 500, "ease", function () {
        $("#eventMatchInfo").show();
        $("#eventMatchInfo").transition({ queue: false, height: eventMatchInfoDown }, 500, "ease", callback);
      });
    });
  });
};

$(function () {
  displayUrlParams = new URLSearchParams(window.location.search);
  const background = displayUrlParams.get("background");
  if (background && background !== "transparent") {
    document.body.style.backgroundColor = background;
  }
  const sides = DisplayShared.applyDisplaySides(displayUrlParams);
  redSide = sides.redSide;
  blueSide = sides.blueSide;

  const overlayCentering = $("#overlayCentering");
  const scaleWrapper = $("#scaleWrapper");
  overlayCentering.attr("data-visible", "false");
  const topSpacingPx = parseInt(displayUrlParams.get("topSpacingPx"), 10);
  if (displayUrlParams.get("overlayLocation") === "top") {
    scaleWrapper.css("align-self", "flex-start");
    scaleWrapper.css("margin-top", `${topSpacingPx}px`);
  } else if (displayUrlParams.get("overlayLocation") === "bottom") {
    scaleWrapper.css("align-self", "flex-end");
    scaleWrapper.css("margin-bottom", `${topSpacingPx}px`);
  }

  updateFullScreenScale();
  $(window).on("resize", updateFullScreenScale);

  websocket = new CheesyWebsocket("/displays/audience_score/websocket", {
    audienceDisplayMode: function (event) {
      handleAudienceDisplayMode(event.data);
    },
    matchLoad: function (event) {
      handleMatchLoad(event.data);
    },
    matchTime: function (event) {
      handleMatchTime(event.data);
    },
    matchTiming: function (event) {
      handleMatchTiming(event.data);
    },
    realtimeScore: function (event) {
      handleRealtimeScore(event.data);
    },
    playSound: function (event) {
      handlePlaySound(event.data);
    },
    scorePosted: function (event) {
      handleScorePosted(event.data);
    },
  });

  transitionMap = {
    blank: {
      intro: transitionBlankToIntro,
      match: transitionBlankToMatch,
      score: transitionBlankToScore,
      timeout: transitionBlankToTimeout,
    },
    intro: {
      blank: transitionIntroToBlank,
      match: transitionIntroToMatch,
      timeout: transitionIntroToTimeout,
    },
    match: {
      blank: transitionMatchToBlank,
      intro: transitionMatchToIntro,
      score: transitionMatchToScore,
    },
    score: {
      blank: transitionScoreToBlank,
    },
    timeout: {
      blank: transitionTimeoutToBlank,
      intro: transitionTimeoutToIntro,
    },
  };
});
