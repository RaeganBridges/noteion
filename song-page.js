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

  function formatMeaningForDisplay(text) {
    var s = String(text || "").trim();
    if (!s) return "";
    return s
      .split(/\n\n+/)
      .map(function (para) {
        var block = para.trim();
        if (!block) return "";
        return "<p>" + escapeHtml(block).replace(/\n/g, "<br>") + "</p>";
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

    function fmtDateOnly(ts) {
      if (ts == null || ts === "") return "";
      try {
        return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
      } catch (e) {
        return "";
      }
    }

    function fillModalTrackMeta(t) {
      t = t || {};
      var artist = String(t.artist || t.songArtist || "").trim();
      var $a = $(".js-modal-track-artist");
      var $d = $(".js-modal-track-released");
      if (artist) {
        $a.text(artist).removeAttr("hidden");
      } else {
        $a.text("").attr("hidden", "");
      }
      var released = "";
      if (t.releasedAt != null && t.releasedAt !== "") {
        released = fmtDateOnly(t.releasedAt);
      } else if (t.userPublished && t.songPublishedAt != null && t.songPublishedAt !== "") {
        released = fmtDateOnly(t.songPublishedAt);
      }
      if (released) {
        $d.text("Released " + released).removeAttr("hidden");
      } else {
        $d.text("").attr("hidden", "");
      }
    }

    function clearModalSlips() {
      $(".js-modal-slips").empty().attr("aria-hidden", "true");
      $(".js-modal-margin-slips").empty().attr("aria-hidden", "true");
      $(".js-modal-orphan-slips").empty().prop("hidden", true);
      $(".js-modal-orphan-hint").prop("hidden", true);
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

    /**
     * Publisher margin slips beside .lyric-hl spans (paired by order with stickyNotes).
     * Lyrics modal only; relay out after fonts / resize.
     */
    function layoutModalMarginSlips(t) {
      t = t || {};
      var $slips = $(".js-modal-margin-slips").empty();
      var $lyrics = $(".js-modal-lyrics");
      var $block = $(".song-sheet-modal__lyrics-block");
      var $orphan = $(".js-modal-orphan-slips").empty();
      var $orphanHint = $(".js-modal-orphan-hint");

      if (!$block.length || !$lyrics.length) return;

      var notes = (t.stickyNotes || []).filter(function (n) {
        return n && String(n.text || "").trim();
      });
      var hls = $lyrics.find(".lyric-hl").toArray();
      var paired = Math.min(notes.length, hls.length);
      var blockEl = $block[0];

      for (var i = 0; i < paired; i++) {
        var hl = hls[i];
        var note = notes[i];
        var br = blockEl.getBoundingClientRect();
        var hr = hl.getBoundingClientRect();
        var centerY = hr.top - br.top + hr.height / 2;
        var isRight = i % 2 === 1;
        var rot = isRight ? 2.8 : -2.8;
        var $slip = $("<div/>")
          .addClass("song-sheet-modal__modal-slip")
          .addClass(isRight ? "song-sheet-modal__modal-slip--right" : "song-sheet-modal__modal-slip--left")
          .css({
            top: Math.round(centerY) + "px",
            transform: "translateY(-50%) rotate(" + rot + "deg)",
          })
          .attr("role", "note")
          .text(note.text != null ? String(note.text) : "");
        $slips.append($slip);
      }

      if (notes.length > paired) {
        $orphanHint.prop("hidden", false);
        $orphan.prop("hidden", false);
        for (var j = paired; j < notes.length; j++) {
          var $o = $("<div/>")
            .addClass("song-sheet-modal__orphan-slip")
            .text(notes[j].text != null ? String(notes[j].text) : "");
          $orphan.append($o);
        }
      } else {
        $orphanHint.prop("hidden", true);
        $orphan.prop("hidden", true).empty();
      }

      $slips.removeAttr("aria-hidden");
    }

    function scheduleLyricsModalSlipLayout() {
      var t = tracks[idx] || {};
      window.requestAnimationFrame(function () {
        if ($("#song-sheet-modal").prop("hidden") || $("#song-sheet-modal").hasClass("is-meaning-mode")) return;
        layoutModalMarginSlips(t);
        window.requestAnimationFrame(function () {
          if ($("#song-sheet-modal").prop("hidden") || $("#song-sheet-modal").hasClass("is-meaning-mode")) return;
          layoutModalMarginSlips(t);
        });
      });
    }

    /** Viewer comments — meaning notebook overlay only. */
    function renderMeaningModalSlips(t) {
      t = t || {};
      var $wrap = $(".js-modal-slips").empty();
      $wrap.removeAttr("aria-hidden");

      var session = window.SongShareAuth && window.SongShareAuth.getSession();
      var comments = window.SongShareModalComments ? window.SongShareModalComments.load(id, idx) : [];

      var $column = $("<div/>").addClass(
        "song-sheet-modal__slip-column song-sheet-modal__slip-column--meaning"
      );

      var $commFeed = $("<div/>").addClass("song-sheet-modal__slip song-sheet-modal__slip--feed");
      $commFeed.append('<p class="song-sheet-modal__slip-label">Comments</p>');
      var $commInner = $('<div class="song-sheet-modal__slip-feed-inner" aria-live="polite" />');

      if (!comments.length) {
        $commInner.append('<p class="song-sheet-modal__comment-empty">No comments yet.</p>');
      }

      comments.forEach(function (c) {
        if (!c || !c.body) return;
        var own = session && c.userId === session.userId;
        var delBtn = own
          ? '<button type="button" class="song-sheet-modal__comment-remove js-modal-comment-remove" data-comment-id="' +
            escapeHtml(c.id) +
            '" aria-label="Delete your comment">×</button>'
          : "";
        $commInner.append(
          '<div class="song-sheet-modal__comment-item">' +
            delBtn +
            '<div class="song-sheet-modal__comment-meta">' +
            escapeHtml(c.displayName || "Member") +
            (c.ts ? " · " + escapeHtml(fmtWhen(c.ts)) : "") +
            "</div>" +
            '<div class="song-sheet-modal__comment-text">' +
            escapeHtml(String(c.body)) +
            "</div></div>"
        );
      });

      $commFeed.append($commInner);

      var $compose = $("<div/>").addClass("song-sheet-modal__slip song-sheet-modal__slip--compose");

      if (session) {
        $compose.append('<p class="song-sheet-modal__slip-label">Your comment</p>');
        $compose.append(
          '<textarea class="song-sheet-modal__comment-input js-modal-comment-input" rows="2" maxlength="600" placeholder="Write a comment…" aria-label="Comment text"></textarea>'
        );
        $compose.append(
          '<button type="button" class="song-sheet-modal__comment-post js-modal-comment-post">Post</button>'
        );
      } else {
        $compose.append('<p class="song-sheet-modal__slip-guest">Sign in to post comments.</p>');
        $compose.append(
          '<a class="song-sheet-modal__slip-auth-link" href="home.html">Back to sign in</a>'
        );
      }

      $column.append($commFeed, $compose);
      $wrap.append($column);
    }

    function closeSheetModal() {
      var $m = $("#song-sheet-modal");
      if (!$m.length || $m.prop("hidden")) return;
      $m.removeClass("is-meaning-mode");
      $(".js-modal-body-meaning").attr("hidden", "");
      $(".js-modal-body-song").removeAttr("hidden");
      clearModalSlips();
      $m.prop("hidden", true).attr("aria-hidden", "true");
      $(document.documentElement).removeClass("sheet-modal-open");
      $("body").removeClass("sheet-modal-open");
    }

    function openSongSheetModal() {
      var t = tracks[idx] || {};
      var $m = $("#song-sheet-modal");
      $m.prop("hidden", false).attr("aria-hidden", "false").removeClass("is-meaning-mode");
      $(document.documentElement).addClass("sheet-modal-open");
      $("body").addClass("sheet-modal-open");

      $(".js-modal-body-meaning").attr("hidden", "");
      $(".js-modal-body-song").removeAttr("hidden");

      $(".js-modal-script-title").text(t.title || "—");
      fillModalTrackMeta(t);
      clearModalSlips();

      var lh = t.lyricsHtml != null ? String(t.lyricsHtml).trim() : "";
      if (lh) {
        $(".js-modal-lyrics").html(formatLyricsForDisplay(lh));
      } else {
        $(".js-modal-lyrics").html(
          '<p class="song-sheet-modal__empty">No lyrics on this card yet. Use the toolbar reader icon to look lyrics up.</p>'
        );
      }

      scheduleLyricsModalSlipLayout();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          scheduleLyricsModalSlipLayout();
        });
      }

      window.setTimeout(function () {
        $(".song-sheet-modal__x").trigger("focus");
      }, 30);
    }

    function openMeaningSheetModal() {
      var t = tracks[idx] || {};
      var $m = $("#song-sheet-modal");
      $m.prop("hidden", false).attr("aria-hidden", "false").addClass("is-meaning-mode");
      $(document.documentElement).addClass("sheet-modal-open");
      $("body").addClass("sheet-modal-open");

      $(".js-modal-margin-slips").empty().attr("aria-hidden", "true");
      $(".js-modal-orphan-slips").empty().prop("hidden", true);
      $(".js-modal-orphan-hint").prop("hidden", true);

      $(".js-modal-body-song").attr("hidden", "");
      $(".js-modal-body-meaning").removeAttr("hidden");

      $(".js-modal-script-title").text(t.title || "—");
      fillModalTrackMeta(t);

      var mean = t.meaning != null ? String(t.meaning).trim() : "";
      if (mean) {
        $(".js-modal-meaning").html(formatMeaningForDisplay(mean));
      } else {
        $(".js-modal-meaning").html('<p class="song-sheet-modal__empty">No meaning for this track yet.</p>');
      }
      var by = String(t.meaningBy || "").trim();
      var metaParts = [];
      if (by) metaParts.push(by);
      if (t.meaningAt) metaParts.push(fmtWhen(t.meaningAt));
      $(".js-modal-meaning-meta").text(metaParts.join(" · "));

      renderMeaningModalSlips(t);

      window.setTimeout(function () {
        $(".song-sheet-modal__x").trigger("focus");
      }, 30);
    }

    function syncNavLinks() {
      $(".js-open-reader").attr("href", readerUrlFor(id, idx));
    }

    function openReader() {
      window.location.href = readerUrlFor(id, idx);
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

      var mean = t.meaning != null ? String(t.meaning).trim() : "";
      if (mean) {
        $(".js-meaning").html(formatMeaningForDisplay(mean));
      } else {
        $(".js-meaning").text("—");
      }
      var by = String(t.meaningBy || "").trim();
      var metaParts = [];
      if (by) metaParts.push(by);
      if (t.meaningAt) metaParts.push(fmtWhen(t.meaningAt));
      if (metaParts.length) {
        $(".js-meaning-meta").text(metaParts.join(" · ")).removeAttr("hidden");
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
      closeSheetModal();
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
      openSongSheetModal();
    });

    $(".js-song-paper").on("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSongSheetModal();
      }
    });

    $(".js-meaning-paper").on("click", function (e) {
      if ($(e.target).closest("a, button").length) return;
      openMeaningSheetModal();
    });

    $(".js-meaning-paper").on("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMeaningSheetModal();
      }
    });

    $(".js-sheet-modal-close").on("click", function () {
      closeSheetModal();
    });

    $(document).on("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("#song-sheet-modal").prop("hidden")) {
        closeSheetModal();
      }
    });

    $("#song-sheet-modal").on("click", ".js-modal-comment-post", function () {
      var sess = window.SongShareAuth && window.SongShareAuth.getSession();
      if (!sess || !window.SongShareModalComments) return;
      var body = String($("#song-sheet-modal .js-modal-comment-input").val() || "").trim();
      if (!body) return;
      window.SongShareModalComments.append(id, idx, {
        id: "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10),
        userId: sess.userId,
        displayName: sess.displayName || sess.email || "Member",
        body: body,
        ts: new Date().toISOString(),
      });
      $("#song-sheet-modal .js-modal-comment-input").val("");
      renderMeaningModalSlips(tracks[idx] || {});
    });

    $("#song-sheet-modal").on("click", ".js-modal-comment-remove", function () {
      var cid = $(this).attr("data-comment-id");
      var sess = window.SongShareAuth && window.SongShareAuth.getSession();
      if (!sess || !cid || !window.SongShareModalComments) return;
      window.SongShareModalComments.removeById(id, idx, cid);
      renderMeaningModalSlips(tracks[idx] || {});
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

    var lyricsSlipLayoutTimer = null;
    $(window).on("resize", function () {
      if ($("#song-sheet-modal").prop("hidden") || $("#song-sheet-modal").hasClass("is-meaning-mode")) return;
      if (lyricsSlipLayoutTimer) window.clearTimeout(lyricsSlipLayoutTimer);
      lyricsSlipLayoutTimer = window.setTimeout(function () {
        lyricsSlipLayoutTimer = null;
        layoutModalMarginSlips(tracks[idx] || {});
      }, 120);
    });
  });
})(jQuery);
