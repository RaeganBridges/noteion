/**
 * Song Share — genres by popularity; hover plays royalty-free genre demos (Kevin MacLeod /
 * incompetech.com, CC BY 4.0). See genres-data.js for per-genre URLs and associated artist names.
 * Layered motion + setlist drawer echo the immersion of promo sites like SIRUP OWARI DIARY.
 */
(function ($) {
  "use strict";

  var genres = window.SONG_SHARE_GENRES || [];

  var $openBtn;
  var parallaxRaf = null;
  /** Browsers block audio.play() until there has been a user gesture; hover alone is not enough. */
  var genreAudioPrimed = false;
  var $lastHoveredGenreCard = null;
  /** Tiny silent WAV — primes WebKit audio stack when played once inside a gesture. */
  var SILENT_AUDIO =
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

  function hashAngle(seed) {
    var x = Math.sin(seed * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 24 - 12;
  }

  function buildCards() {
    var $board = $("#genre-board");
    $board.empty();

    var $rowTop = $('<div class="scrapbook-row scrapbook-row--top"></div>');
    var $rowBottom = $('<div class="scrapbook-row scrapbook-row--bottom"></div>');
    var half = Math.ceil(genres.length / 2);

    genres.forEach(function (g, i) {
      var rank = i + 1;
      var tilt = hashAngle(rank * 7 + 3).toFixed(2);
      var id = "genre-card-" + rank;
      var artistsHint = g.inspiredByArtists
        ? " Artists often linked with this genre include " + g.inspiredByArtists + "."
        : "";
      var $card = $(
        '<article class="genre-card" id="' +
          id +
          '" tabindex="0" role="button" aria-label="' +
          rank +
          ". " +
          g.name +
          "." +
          artistsHint +
          " A royalty-free demo clip plays on hover." +
          " Open genre page." +
          '">' +
          '<div class="card-inner" style="--tilt:' +
          tilt +
          'deg">' +
          '<div class="card-face">' +
          '<span class="genre-rank">' +
          rank +
          "</span>" +
          '<span class="genre-name"></span>' +
          "</div>" +
          '<div class="vinyl-wrap"><div class="vinyl" aria-hidden="true"></div></div>' +
          '<audio preload="metadata" playsinline src="' +
          g.audio +
          '"></audio>' +
          "</div>" +
          "</article>"
      );
      $card.find(".genre-name").text(g.name);
      if (i < half) {
        $rowTop.append($card);
      } else {
        $rowBottom.append($card);
      }
    });

    $board.append($rowTop, $rowBottom);
  }

  function buildSetlist() {
    var $list = $(".js-setlist-list");
    $list.empty();
    genres.forEach(function (g, i) {
      var rank = i + 1;
      var $li = $("<li></li>");
      var $btn = $('<button type="button"></button>');
      $btn.text(g.name);
      $btn.attr("data-target", "genre-card-" + rank);
      $li.append($btn);
      $list.append($li);
    });
  }

  function pauseAllExcept($keep) {
    $(".genre-card").each(function () {
      var $c = $(this);
      if ($keep && $c[0] === $keep[0]) return;
      var audio = $c.find("audio")[0];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      $c.find(".vinyl").removeClass("spinning");
    });
  }

  function primeGenreAudioFromGesture() {
    if (genreAudioPrimed) return;
    var a = document.createElement("audio");
    a.setAttribute("playsinline", "");
    a.src = SILENT_AUDIO;
    var p = a.play();
    function afterOk() {
      genreAudioPrimed = true;
      try {
        a.pause();
      } catch (e) {}
      if ($lastHoveredGenreCard && $lastHoveredGenreCard.length) {
        playCard($lastHoveredGenreCard);
      }
    }
    if (p && typeof p.then === "function") {
      p.then(afterOk).catch(function () {});
    } else {
      afterOk();
    }
  }

  function bindGenreAudioPriming() {
    var opts = { capture: true, passive: true };
    document.addEventListener("pointerdown", primeGenreAudioFromGesture, opts);
    document.addEventListener("keydown", primeGenreAudioFromGesture, opts);
    document.addEventListener("touchstart", primeGenreAudioFromGesture, opts);
    window.addEventListener("songshare:authed", primeGenreAudioFromGesture);
  }

  function playCard($card) {
    var audio = $card.find("audio")[0];
    var $vinyl = $card.find(".vinyl");
    if (!audio || !audio.src) return;
    $lastHoveredGenreCard = $card;
    pauseAllExcept($card);
    $vinyl.addClass("spinning");
    var p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        $vinyl.removeClass("spinning");
      });
    }
  }

  function stopCard($card) {
    var audio = $card.find("audio")[0];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    $card.find(".vinyl").removeClass("spinning");
  }

  function bindHover() {
    $(document)
      .on("mouseenter", ".genre-card", function () {
        var $c = $(this);
        $lastHoveredGenreCard = $c;
        playCard($c);
      })
      .on("mouseleave", ".genre-card", function () {
        var $card = $(this);
        if (!$card[0].matches(":focus-within")) {
          stopCard($card);
        }
      })
      .on("focusin", ".genre-card", function () {
        playCard($(this));
      })
      .on("focusout", ".genre-card", function () {
        stopCard($(this));
      });

    document.addEventListener(
      "touchstart",
      function (e) {
        var t = e.target;
        if (!t || typeof t.closest !== "function") return;
        var card = t.closest(".genre-card");
        if (!card) return;
        var $c = $(card);
        $lastHoveredGenreCard = $c;
        playCard($c);
      },
      { passive: true }
    );
  }

  function bindCardNavigation() {
    $(document).on("click", ".genre-card", function () {
      var raw = (this.id || "").replace(/^genre-card-/, "");
      var n = parseInt(raw, 10);
      if (!n || n < 1) return;
      window.location.href = "song.html?id=" + encodeURIComponent(String(n));
    });

    $(document).on("keydown", ".genre-card", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        $(this).trigger("click");
      }
    });
  }

  function openSetlist() {
    var $popup = $("#genre-setlist");
    $popup.addClass("is-open").attr("aria-hidden", "false");
    $("body").addClass("is-popup-open");
    $openBtn.attr("aria-expanded", "true");
    var $first = $popup.find(".setlist-list button").first();
    if ($first.length) {
      $first.trigger("focus");
    }
  }

  function closeSetlist() {
    var $popup = $("#genre-setlist");
    $popup.removeClass("is-open").attr("aria-hidden", "true");
    $("body").removeClass("is-popup-open");
    $openBtn.attr("aria-expanded", "false");
    $openBtn.trigger("focus");
  }

  function bindSetlist() {
    $openBtn = $(".js-open-setlist");
    $openBtn.on("click", function () {
      openSetlist();
    });

    $(".js-close-setlist").on("click", function () {
      closeSetlist();
    });

    $(document).on("keydown", function (e) {
      if (e.key === "Escape" && $("#genre-setlist").hasClass("is-open")) {
        closeSetlist();
      }
    });

    $(".js-setlist-list").on("click", "button", function () {
      var id = $(this).attr("data-target");
      var $card = $("#" + id);
      if (!$card.length) return;
      closeSetlist();
      var scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      $card[0].scrollIntoView({
        behavior: scrollBehavior,
        block: "nearest",
        inline: "center",
      });
      $card.addClass("is-spotlight");
      window.setTimeout(function () {
        $card.removeClass("is-spotlight");
      }, 1100);
      $card.trigger("focus");
    });
  }

  function finishLoading() {
    $(".page-loading").addClass("is-done");
  }

  function bindLoading() {
    var done = false;
    function go() {
      if (done) return;
      done = true;
      finishLoading();
    }
    $(window).on("load", go);
    window.setTimeout(go, 2200);
  }

  function bindParallax() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    $(document).on("mousemove", function (e) {
      if (parallaxRaf) window.cancelAnimationFrame(parallaxRaf);
      parallaxRaf = window.requestAnimationFrame(function () {
        var cx = window.innerWidth * 0.5;
        var cy = window.innerHeight * 0.5;
        var dx = (e.clientX - cx) / cx;
        var dy = (e.clientY - cy) / cy;
        $(".main-back").css(
          "transform",
          "translate(" + dx * 14 + "px," + dy * 10 + "px)"
        );
        $(".main-book").css(
          "transform",
          "translate(" + dx * 22 + "px," + dy * 16 + "px)"
        );
        $(".main-fore").css(
          "transform",
          "translate(" + dx * 8 + "px," + dy * 6 + "px)"
        );
      });
    });
  }

  /**
   * Flex layout used to let .board-scroll grow to full content width (no overflow).
   * min-width:0 fixes that; this maps vertical wheel to horizontal scroll for trackpads/mice.
   */
  function bindBoardScrollWheel() {
    var el = document.querySelector(".board-scroll");
    if (!el) return;
    el.addEventListener(
      "wheel",
      function (e) {
        if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        var max = el.scrollWidth - el.clientWidth;
        if (max <= 1) return;
        var next = el.scrollLeft + e.deltaY;
        if (next < 0 && el.scrollLeft <= 0) return;
        if (next > max && el.scrollLeft >= max - 1) return;
        el.scrollLeft = next;
        e.preventDefault();
      },
      { passive: false }
    );
  }

  $(function () {
    bindGenreAudioPriming();
    if (!genres.length) return;
    buildCards();
    buildSetlist();
    bindHover();
    bindCardNavigation();
    bindSetlist();
    bindLoading();
    bindParallax();
    bindBoardScrollWheel();
  });
})(jQuery);
