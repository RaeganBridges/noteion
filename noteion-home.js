/**
 * Noteion — genres by popularity; hover plays short clips from genre-clips/*.mp3 when present
 * (built from YouTube via scripts/fetch-genre-clips.py + yt-dlp), else audioFallback in genres-data.js.
 * Layered motion + setlist drawer echo the immersion of promo sites like SIRUP OWARI DIARY.
 */
(function ($) {
  "use strict";

  function getGenres() {
    return window.SONG_SHARE_GENRES || [];
  }

  var $openBtn;
  var $lyricsSearchBtn;
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

  var STACK_PRESET_COUNT = 4;

  function normalizeStackIdx(n) {
    var i = Math.floor(n) % STACK_PRESET_COUNT;
    return i < 0 ? i + STACK_PRESET_COUNT : i;
  }

  function getStoredStackPreset(rank) {
    try {
      var raw = localStorage.getItem("noteion.genreStackArr");
      if (raw) {
        var m = JSON.parse(raw);
        if (m && typeof m === "object" && typeof m[String(rank)] === "number") {
          return normalizeStackIdx(m[String(rank)]);
        }
      }
      var g = localStorage.getItem("noteion.genreStackGlobal");
      if (g != null && g !== "") {
        var n = parseInt(g, 10);
        if (!isNaN(n)) return normalizeStackIdx(n);
      }
    } catch (e) {}
    return 0;
  }

  function setStoredStackPreset(rank, idx) {
    try {
      var raw = localStorage.getItem("noteion.genreStackArr");
      var m = raw ? JSON.parse(raw) : {};
      if (typeof m !== "object" || m === null) m = {};
      m[String(rank)] = normalizeStackIdx(idx);
      localStorage.setItem("noteion.genreStackArr", JSON.stringify(m));
    } catch (e) {}
  }

  function getStoredCoverIdx(rank) {
    try {
      var raw = localStorage.getItem("noteion.genreCoverIdx");
      if (raw) {
        var m = JSON.parse(raw);
        if (m && typeof m === "object" && typeof m[String(rank)] === "number") {
          var n = m[String(rank)];
          return !isNaN(n) && n >= 0 ? n : 0;
        }
      }
    } catch (e) {}
    return 0;
  }

  function setStoredCoverIdx(rank, idx) {
    try {
      var raw = localStorage.getItem("noteion.genreCoverIdx");
      var m = raw ? JSON.parse(raw) : {};
      if (typeof m !== "object" || m === null) m = {};
      m[String(rank)] = idx;
      localStorage.setItem("noteion.genreCoverIdx", JSON.stringify(m));
    } catch (e) {}
  }

  function applyInnerBoardCover($inner, covers, idx) {
    if (!$inner || !$inner.length) return;
    if (!covers || !covers.length) {
      $inner.removeData("noteionBoardCovers");
      $inner.removeAttr("data-has-board-cover").css({
        "--board-cover": "",
        "--board-cover-next": "",
        "--board-cover-third": "",
      });
      return;
    }
    var len = covers.length;
    var n = Number(idx);
    if (isNaN(n)) n = 0;
    var i0 = ((n % len) + len) % len;
    var i1 = ((i0 + 1) % len + len) % len;
    var i2 = ((i0 + 2) % len + len) % len;
    var url0 = covers[i0];
    var url1 = covers[i1];
    var url2 = covers[i2];
    $inner.data("noteionBoardCovers", covers);
    $inner.attr("data-has-board-cover", "1").css({
      "--board-cover": "url(" + JSON.stringify(String(url0).trim()) + ")",
      "--board-cover-next": "url(" + JSON.stringify(String(url1).trim()) + ")",
      "--board-cover-third": "url(" + JSON.stringify(String(url2).trim()) + ")",
    });
  }

  function applyFaceBoardCover($face, covers, idx) {
    if (!$face || !$face.length) return;
    if (!covers || !covers.length) {
      $face.removeData("noteionBoardCovers");
      $face.removeAttr("data-has-face-cover").css("--face-cover", "");
      return;
    }
    var len = covers.length;
    var n = Number(idx);
    if (isNaN(n)) n = 0;
    var i = ((n % len) + len) % len;
    var url = covers[i];
    $face.data("noteionBoardCovers", covers);
    $face.attr("data-has-face-cover", "1").css(
      "--face-cover",
      "url(" + JSON.stringify(String(url).trim()) + ")"
    );
  }

  function collectBoardCovers(g) {
    if (Array.isArray(g.boardStackCoverUrls) && g.boardStackCoverUrls.length) {
      return g.boardStackCoverUrls.slice();
    }
    if (g.boardStackCoverUrl && String(g.boardStackCoverUrl).trim()) {
      return [String(g.boardStackCoverUrl).trim()];
    }
    return [];
  }

  function genreOverlayColor(rank, total) {
    var t = total && total > 1 ? (rank - 1) / (total - 1) : 0;
    var startHue = 330; /* pink */
    var endHue = 690; /* full rainbow sweep ending near pink/red */
    var hue = (startHue + (endHue - startHue) * t) % 360;
    return "hsl(" + hue.toFixed(1) + ", 96%, 54%)";
  }

  function genreOverlayHueDeg(rank, total) {
    var t = total && total > 1 ? (rank - 1) / (total - 1) : 0;
    var startHue = 330;
    var endHue = 690;
    var hue = (startHue + (endHue - startHue) * t) % 360;
    return hue.toFixed(1) + "deg";
  }

  function buildGenreCard(g, rank, totalGenres) {
    var tilt = hashAngle(rank * 7 + 3).toFixed(2);
    var id = "genre-card-" + rank;
    var artistsHint = g.inspiredByArtists
      ? " Artists often linked with this genre include " + g.inspiredByArtists + "."
      : "";
    var sp = getStoredStackPreset(rank);
    var stickerKind = (rank - 1) % 6;
    var stackRise = (rank - 1) % 8;
    var $card = $(
      '<article class="genre-card" id="' +
        id +
        '" tabindex="0" role="button" aria-label="' +
        rank +
        ". " +
        g.name +
        "." +
        artistsHint +
        " A short preview clip plays on hover." +
        " Open genre page." +
        '">' +
        '<div class="genre-card-controls">' +
        '<div class="stack-shuffle" data-sticker="' +
        stickerKind +
        '" data-stack-rise="' +
        stackRise +
        '" role="group" aria-label="Shuffle stack layout and cover art for this genre">' +
        '<button type="button" class="stack-shuffle-btn stack-shuffle-btn--prev" aria-label="Previous stack layout and cover art">' +
        '<svg class="stack-shuffle-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M15 6L9 12l6 6"/></svg>' +
        "</button>" +
        '<button type="button" class="stack-shuffle-btn stack-shuffle-btn--next" aria-label="Next stack layout and cover art">' +
        '<svg class="stack-shuffle-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>' +
        "</button>" +
        "</div>" +
        "</div>" +
        '<div class="card-inner" style="--tilt:' +
        tilt +
        'deg" data-stack-arr="' +
        sp +
        '">' +
        '<div class="card-face">' +
        '<span class="genre-rank">' +
        rank +
        "</span>" +
        '<span class="genre-name"></span>' +
        "</div>" +
        '<div class="vinyl-wrap"><div class="vinyl" aria-hidden="true"></div></div>' +
        '<audio preload="metadata" playsinline></audio>' +
        "</div>" +
        "</article>"
    );
    $card.find(".genre-name").text(g.name);
    $card.css({
      "--genre-overlay": genreOverlayColor(rank, totalGenres),
      "--genre-hue-deg": genreOverlayHueDeg(rank, totalGenres),
    });
    var $innerNode = $card.find(".card-inner");
    var $faceNode = $card.find(".card-face");
    var covers = collectBoardCovers(g);
    if (covers.length) {
      var ci = getStoredCoverIdx(rank) % covers.length;
      applyInnerBoardCover($innerNode, covers, ci);
      applyFaceBoardCover($faceNode, covers, ci);
    } else {
      applyInnerBoardCover($innerNode, [], 0);
      applyFaceBoardCover($faceNode, [], 0);
    }
    var $au = $card.find("audio");
    if (g.audioHoverPreload) {
      $au.attr("preload", "auto");
    }
    $au.attr("src", g.audio || "");
    if (g.audioFallback) {
      $au.on("error", function () {
        var el = this;
        if (el.dataset.noteionFb === "1" || !g.audioFallback) return;
        el.dataset.noteionFb = "1";
        el.src = g.audioFallback;
        el.load();
        var n = $card[0];
        if (
          n &&
          (n.matches(":hover") || n.matches(":focus-within"))
        ) {
          var p = el.play();
          if (p && typeof p.catch === "function") {
            p.catch(function () {});
          }
        }
      });
    }
    return $card;
  }

  function buildCards() {
    var $board = $("#genre-board");
    $board.empty();

    var $rowTop = $('<div class="scrapbook-row scrapbook-row--top"></div>');
    var $rowBottom = $('<div class="scrapbook-row scrapbook-row--bottom"></div>');
    var genres = getGenres();
    var half = Math.ceil(genres.length / 2);

    genres.forEach(function (g, i) {
      var rank = i + 1;
      var $card = buildGenreCard(g, rank, genres.length);
      if (i < half) {
        $rowTop.append($card);
      } else {
        $rowBottom.append($card);
      }
    });

    $board.append($rowTop, $rowBottom);
  }

  function buildSetlist() {
    var genres = getGenres();
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

  function clearAudioHoverCap(audio) {
    if (!audio || !audio._noteionHoverCap) return;
    audio.removeEventListener("timeupdate", audio._noteionHoverCap);
    audio._noteionHoverCap = null;
  }

  function genreFromCard($card) {
    var raw = ($card.attr("id") || "").replace(/^genre-card-/, "");
    var rank = parseInt(raw, 10);
    if (isNaN(rank) || rank < 1) return null;
    return getGenres()[rank - 1] || null;
  }

  function pauseAllExcept($keep) {
    $(".genre-card").each(function () {
      var $c = $(this);
      if ($keep && $c[0] === $keep[0]) return;
      var audio = $c.find("audio")[0];
      if (audio) {
        clearAudioHoverCap(audio);
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
    clearAudioHoverCap(audio);
    $vinyl.addClass("spinning");
    var g = genreFromCard($card);
    var startSec =
      g && typeof g.audioHoverStartSec === "number" && g.audioHoverStartSec > 0
        ? g.audioHoverStartSec
        : 0;
    var maxSec =
      g && typeof g.audioHoverMaxSec === "number" && g.audioHoverMaxSec > 0
        ? g.audioHoverMaxSec
        : null;
    var endSec =
      maxSec != null
        ? startSec > 0
          ? startSec + maxSec
          : maxSec
        : null;
    if (endSec != null) {
      var capFn = function () {
        if (audio.currentTime >= endSec) {
          audio.pause();
          audio.currentTime = 0;
          $vinyl.removeClass("spinning");
          clearAudioHoverCap(audio);
        }
      };
      audio._noteionHoverCap = capFn;
      audio.addEventListener("timeupdate", capFn);
    }
    function beginPlay() {
      if (startSec > 0) {
        try {
          audio.currentTime = startSec;
        } catch (e) {}
      }
      var p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () {
          $vinyl.removeClass("spinning");
          clearAudioHoverCap(audio);
        });
      }
    }
    if (startSec > 0 && audio.readyState < 1) {
      audio.addEventListener("loadedmetadata", function onMeta() {
        audio.removeEventListener("loadedmetadata", onMeta);
        beginPlay();
      });
      try {
        audio.load();
      } catch (e) {}
      return;
    }
    beginPlay();
  }

  function stopCard($card) {
    var audio = $card.find("audio")[0];
    if (audio) {
      clearAudioHoverCap(audio);
      audio.pause();
      audio.currentTime = 0;
    }
    $card.find(".vinyl").removeClass("spinning");
  }

  function bindStackShuffle() {
    $(document).on("click", ".genre-card .stack-shuffle-btn", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var $btn = $(this);
      var $card = $btn.closest(".genre-card");
      var $inner = $card.find(".card-inner");
      if (!$inner.length) return;
      var cur = parseInt($inner.attr("data-stack-arr"), 10);
      if (isNaN(cur)) cur = 0;
      var next;
      if ($btn.hasClass("stack-shuffle-btn--prev")) {
        next = (cur - 1 + STACK_PRESET_COUNT) % STACK_PRESET_COUNT;
      } else {
        next = (cur + 1) % STACK_PRESET_COUNT;
      }
      $inner.attr("data-stack-arr", String(next));
      var raw = ($card.attr("id") || "").replace(/^genre-card-/, "");
      var rank = parseInt(raw, 10);
      if (!isNaN(rank) && rank > 0) {
        setStoredStackPreset(rank, next);
        var covers = $inner.data("noteionBoardCovers") || [];
        if (covers.length > 1) {
          var $face = $card.find(".card-face");
          var curC = getStoredCoverIdx(rank) % covers.length;
          var nextC;
          if ($btn.hasClass("stack-shuffle-btn--prev")) {
            nextC = (curC - 1 + covers.length) % covers.length;
          } else {
            nextC = (curC + 1) % covers.length;
          }
          setStoredCoverIdx(rank, nextC);
          applyInnerBoardCover($inner, covers, nextC);
          applyFaceBoardCover($face, covers, nextC);
        }
      }
    });
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
    closeLyricsSearch();
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

  function clearLyricsSearchResults() {
    var $block = $(".js-lyrics-search-results");
    $block.attr("hidden", "");
    $(".js-lyrics-search-song-line").text("");
    $(".js-lyrics-search-count").text("");
    $(".js-lyrics-search-posts").empty();
  }

  function runLyricsCommunitySearch() {
    var title = String($("#lyrics-q-title").val() || "").trim();
    var artist = String($("#lyrics-q-artist").val() || "").trim();
    var profile = String($("#lyrics-q-profile").val() || "").trim();
    var SP = window.SongSharePublished;
    if (!SP || typeof SP.findPostsBySong !== "function") {
      return;
    }
    if (!title && !profile) {
      window.alert("Add a song or album title, or a profile display name to search.");
      return;
    }
    var posts;
    var profileOnly = !title && !!profile;
    if (profileOnly) {
      posts =
        typeof SP.findPostsByProfile === "function"
          ? SP.findPostsByProfile(profile)
          : [];
    } else {
      posts = SP.findPostsBySong(title, artist);
      if (profile && typeof SP.filterPostsByProfile === "function") {
        posts = SP.filterPostsByProfile(posts, profile);
      }
    }
    var $block = $(".js-lyrics-search-results");
    var $songLine = $(".js-lyrics-search-song-line");
    var $count = $(".js-lyrics-search-count");
    var $ul = $(".js-lyrics-search-posts").empty();

    if (profileOnly) {
      $songLine.text('Profile: "' + profile + '"');
    } else {
      var head = artist ? title + " · " + artist : title;
      $songLine.text(profile ? head + " · profile: " + profile : head);
    }
    $block.removeAttr("hidden");

    if (!posts.length) {
      if (profileOnly) {
        $count.text('No community posts from publishers matching that display name.');
      } else if (profile) {
        $count.text(
          "No community posts match this song and profile (try a different spelling or profile)."
        );
      } else {
        $count.text("No community posts match (try a track title, album title, or artist).");
      }
      return;
    }
    var n = posts.length;
    if (profileOnly) {
      $count.text(n === 1 ? "1 post from this profile" : n + " posts from matching profiles");
    } else {
      $count.text(n === 1 ? "1 post by the community" : n + " posts by the community");
    }

    posts.forEach(function (p) {
      var loc =
        window.SongSharePublished.resolvePostBoardLocation &&
        window.SongSharePublished.resolvePostBoardLocation(p.id);
      var who = p.displayName || p.meaningAuthor || "Member";
      var trackLine =
        p.albumTitle && String(p.albumTitle).trim()
          ? String(p.albumTitle).trim() + " — " + String(p.title || "").trim()
          : String(p.title || "").trim() || "Untitled";
      var $li = $("<li/>").addClass("lyrics-search-post-item");
      var $row = $("<div/>").addClass("lyrics-search-post-row");
      var $track = $("<span/>").addClass("lyrics-search-post-track");
      $track.text(trackLine);
      var $bottom = $("<div/>").addClass("lyrics-search-post-bottom");
      var $meta = $("<span/>").addClass("lyrics-search-post-by");
      $meta.text("By " + who + (loc ? " · " + loc.genreName : ""));
      $bottom.append($meta);
      if (loc) {
        var href =
          "song.html?id=" +
          encodeURIComponent(String(loc.genreId)) +
          "&track=" +
          encodeURIComponent(String(loc.trackIdx));
        $bottom.append(
          $("<a/>", {
            class: "lyrics-search-post-link",
            href: href,
            text: "View post",
          })
        );
      } else {
        $bottom.append(
          $("<span/>", {
            class: "lyrics-search-post-unavail",
            text: "Not on board",
          })
        );
      }
      $row.append($track);
      $row.append($bottom);
      $li.append($row);
      $ul.append($li);
    });
  }

  function openLyricsSearch() {
    closeSetlist();
    clearLyricsSearchResults();
    var $popup = $("#lyrics-search-panel");
    $popup.addClass("is-open").attr("aria-hidden", "false");
    $("body").addClass("is-popup-open");
    if ($lyricsSearchBtn && $lyricsSearchBtn.length) {
      $lyricsSearchBtn.attr("aria-expanded", "true");
    }
    $("#lyrics-q-title").trigger("focus");
  }

  function closeLyricsSearch() {
    var $popup = $("#lyrics-search-panel");
    $popup.removeClass("is-open").attr("aria-hidden", "true");
    $("body").removeClass("is-popup-open");
    if ($lyricsSearchBtn && $lyricsSearchBtn.length) {
      $lyricsSearchBtn.attr("aria-expanded", "false");
      $lyricsSearchBtn.trigger("focus");
    }
  }

  function bindLyricsSearch() {
    $lyricsSearchBtn = $(".js-open-lyrics-search");
    if (!$lyricsSearchBtn.length) return;
    $lyricsSearchBtn.on("click", function () {
      openLyricsSearch();
    });
    $(".js-close-lyrics-search").on("click", function () {
      closeLyricsSearch();
    });
    $(".js-search-lyrics-community").on("click", function () {
      runLyricsCommunitySearch();
    });
    $("#lyrics-q-title, #lyrics-q-artist, #lyrics-q-profile").on("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      runLyricsCommunitySearch();
    });
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
      if (e.key !== "Escape") return;
      if ($("#genre-setlist").hasClass("is-open")) {
        closeSetlist();
      }
      if ($("#lyrics-search-panel").hasClass("is-open")) {
        closeLyricsSearch();
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
    if (!getGenres().length) return;
    buildCards();
    buildSetlist();
    bindStackShuffle();
    bindHover();
    bindCardNavigation();
    bindSetlist();
    bindLyricsSearch();
    bindLoading();
    bindParallax();
    bindBoardScrollWheel();

    $(window).on("songshare:remote-posts", function () {
      if (!getGenres().length) return;
      buildCards();
      buildSetlist();
    });
  });
})(jQuery);
