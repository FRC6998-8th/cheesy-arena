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
  if (
    targetScreen !== "intro" &&
    targetScreen !== "match" &&
    targetScreen !== "timeout"
  ) {
    targetScreen = "blank";
  }

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

const transitionBlankToIntro = function (callback) {
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

const transitionBlankToTimeout = function (callback) {
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
  document.body.style.backgroundColor = displayUrlParams.get("background");
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
  });

  transitionMap = {
    blank: {
      intro: transitionBlankToIntro,
      match: transitionBlankToMatch,
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
    },
    timeout: {
      blank: transitionTimeoutToBlank,
      intro: transitionTimeoutToIntro,
    },
  };
});
