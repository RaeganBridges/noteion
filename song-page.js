(function ($) {
  "use strict";

  function queryId() {
    var m = /[?&]id=([^&]*)/.exec(window.location.search);
    if (!m) return NaN;
    return parseInt(decodeURIComponent(m[1]), 10);
  }

  function queryTrack() {
    var m = /[?&]track=([^&]*)/.exec(window.location.search);
    if (!m) return 0;
    var t = parseInt(decodeURIComponent(m[1]), 10);
    return isNaN(t) ? 0 : t;
  }

  function syncSongUrl(id, idx) {
    if (!window.history || !window.history.replaceState) return;
    var q = "?id=" + encodeURIComponent(String(id)) + "&track=" + encodeURIComponent(String(idx));
    window.history.replaceState(null, "", "song.html" + q);
  }

  function getTracks(g) {
    if (g.tracks && g.tracks.length) {
      return g.tracks;
    }
    if (g.songs && g.songs.length) {
      return g.songs.map(function (title) {
        return { title: title };
      });
    }
    return [{ title: "—" }];
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function newlinesToBrInLyricsHtml(s) {
    s = String(s || "").replace(/\r\n/g, "\n");
    s = s.replace(/>\s*\n\s*</g, "><");
    return s.replace(/\n/g, "<br>");
  }

  function formatLyricsForDisplay(html) {
    var s = String(html || "").trim();
    if (!s) return "";
    if (/<[a-z][\s\S]*>/i.test(s)) {
      return newlinesToBrInLyricsHtml(s);
    }
    var stanzas = s.split(/\n\n+/);
    return stanzas
      .map(function (stanza) {
        var t = stanza.trim();
        if (!t) return "";
        return "<p>" + escapeHtml(t).replace(/\n/g, "<br>") + "</p>";
      })
      .filter(Boolean)
      .join("");
  }

  function readerUrlFor(id, trackIdx) {
    return (
      "song-reader.html?id=" +
      encodeURIComponent(String(id)) +
      "&track=" +
      encodeURIComponent(String(trackIdx))
    );
  }

  function meaningHubUrlFor(id, trackIdx) {
    return (
      "meaning-hub.html?id=" +
      encodeURIComponent(String(id)) +
      "&track=" +
      encodeURIComponent(String(trackIdx))
    );
  }

  $(function () {
    var genres = window.SONG_SHARE_GENRES || [];
    var id = queryId();
    if (!genres.length || !id || id < 1 || id > genres.length) {
      window.location.replace("home.html");
      return;
    }

    var g = genres[id - 1];
    var tracks = getTracks(g);
    var idx = queryTrack();
    idx = Math.max(0, Math.min(idx, tracks.length - 1));
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var FLIP_MS = 900;
    var FLIP_SWAP_AT = Math.round(FLIP_MS * 0.5);
    var isFlipping = false;

    var $meaningTurn = $(".js-sheet-turn-meaning");

    $(".js-genre-label").text(g.name);

    function fmtWhen(ts) {
      if (ts == null || ts === "") return "";
      try {
        return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      } catch (e) {
        return "";
      }
    }

    function renderStickies(notes) {
      var $z = $(".js-song-stickies").empty();
      if (!notes || !notes.length) {
        $z.attr("aria-hidden", "true");
        return;
      }
      $z.removeAttr("aria-hidden");
      notes.forEach(function (n) {
        if (!n || typeof n !== "object") return;
        var left = typeof n.left === "number" ? n.left : parseFloat(n.left);
        var top = typeof n.top === "number" ? n.top : parseFloat(n.top);
        if (isNaN(left)) left = 8;
        if (isNaN(top)) top = 12;
        var $s = $("<div class=\"song-sticky\" />")
          .css({ left: left + "%", top: top + "%" })
          .text(n.text != null ? String(n.text) : "");
        $z.append($s);
      });
    }

    function syncNavLinks() {
      $(".js-open-reader").attr("href", readerUrlFor(id, idx));
    }

    function openReader() {
      window.location.href = readerUrlFor(id, idx);
    }

    function openMeaningHub() {
      window.location.href = meaningHubUrlFor(id, idx);
    }

    function applyTrack(t) {
      t = t || {};
      $(".js-song-title").text(t.title || "—");
      var artist = String(t.artist || t.songArtist || "").trim();
      if (artist) {
        $(".js-song-artist").text(artist).removeAttr("hidden");
      } else {
        $(".js-song-artist").text("").attr("hidden", "");
      }
      var annParts = [];
      if (t.userPublished) {
        if (artist) annParts.push("Artist: " + artist);
        if (t.songPublishedAt) annParts.push("Published " + fmtWhen(t.songPublishedAt));
      }
      if (annParts.length) {
        $(".js-annotation-meta").text(annParts.join(" · ")).removeAttr("hidden");
      } else {
        $(".js-annotation-meta").text("").attr("hidden", "");
      }

      var lh = t.lyricsHtml != null ? String(t.lyricsHtml).trim() : "";
      $(".js-song-lyrics").empty();
      if (lh) {
        $(".js-song-lyrics").html(formatLyricsForDisplay(lh));
        $(".js-song-lyrics-wrap").removeAttr("hidden");
      } else {
        $(".js-song-lyrics-wrap").attr("hidden", "");
      }

      renderStickies(t.stickyNotes);

      var m = t.meaning != null ? String(t.meaning).trim() : "";
      $(".js-meaning").text(m ? m : "—");
      var mParts = [];
      if (t.meaningBy) mParts.push("Posted by " + t.meaningBy);
      if (t.meaningAt) mParts.push(fmtWhen(t.meaningAt));
      if (mParts.length) {
        $(".js-meaning-meta").text(mParts.join(" · ")).removeAttr("hidden");
      } else {
        $(".js-meaning-meta").text("").attr("hidden", "");
      }

      document.title = (t.title || "Song") + " — " + g.name + " — Song Share";
      syncNavLinks();
    }

    function clearFlipClasses() {
      $meaningTurn.removeClass("is-page-next is-page-prev");
    }

    function showTrack(animate, direction) {
      var t = tracks[idx];
      direction = direction === "prev" ? "prev" : "next";

      if (!animate || reduceMotion) {
        applyTrack(t);
        clearFlipClasses();
        return;
      }

      if (isFlipping) return;
      isFlipping = true;

      clearFlipClasses();
      var cls = direction === "next" ? "is-page-next" : "is-page-prev";
      $meaningTurn.addClass(cls);

      window.setTimeout(function () {
        applyTrack(t);
      }, FLIP_SWAP_AT);

      window.setTimeout(function () {
        clearFlipClasses();
        isFlipping = false;
      }, FLIP_MS);
    }

    showTrack(false);
    syncSongUrl(id, idx);

    $(".js-open-reader").on("click", function (e) {
      var href = $(this).attr("href");
      if (!href || href === "#") {
        e.preventDefault();
        openReader();
      }
    });

    $(".js-song-paper").on("click", function (e) {
      if ($(e.target).closest("a, button").length) return;
      openReader();
    });

    $(".js-song-paper").on("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openReader();
      }
    });

    $(".js-meaning-paper").on("click", function (e) {
      if ($(e.target).closest("a, button").length) return;
      openMeaningHub();
    });

    $(".js-meaning-paper").on("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMeaningHub();
      }
    });

    $(".js-prev").on("click", function (e) {
      e.stopPropagation();
      idx = (idx - 1 + tracks.length) % tracks.length;
      showTrack(true, "prev");
      syncSongUrl(id, idx);
    });

    $(".js-next").on("click", function (e) {
      e.stopPropagation();
      idx = (idx + 1) % tracks.length;
      showTrack(true, "next");
      syncSongUrl(id, idx);
    });

    $(".js-close").on("click", function () {
      window.location.href = "home.html";
    });
  });
})(jQuery);
