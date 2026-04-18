(function ($) {
  "use strict";

  var PAGE_FLIP_SOUND_SRC = "genre-clips/makigai_maimai-paper-245786.mp3";
  var DELETE_SOUND_SRC = "genre-clips/oxidvideos-crumpling-paper-wrapping-478933.mp3";
  var pageFlipAudioEl = null;
  var deleteSoundEl = null;
  var pageFlipAudioCtx = null;
  var pageFlipAudioUnlocked = false;

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

  function normalizePlainLyrics(str) {
    if (window.SongShareLyrics && window.SongShareLyrics.normalizeLyricsPlainText) {
      return window.SongShareLyrics.normalizeLyricsPlainText(str);
    }
    return String(str || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
  }

  function htmlLyricsToPlain(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "").trim();
    d.querySelectorAll("br").forEach(function (br) {
      br.replaceWith("\n");
    });
    var paras = d.querySelectorAll("p");
    if (paras.length) {
      return Array.prototype.slice
        .call(paras)
        .map(function (p) {
          return (p.textContent || "").trim();
        })
        .filter(Boolean)
        .join("\n\n");
    }
    return (d.textContent || "").trim();
  }

  function formatPlainLyricsToParagraphHtml(plain) {
    var stanzas = plain.split(/\n\n+/);
    return stanzas
      .map(function (stanza) {
        var t = stanza.trim();
        if (!t) return "";
        return "<p>" + escapeHtml(t).replace(/\n/g, "<br>") + "</p>";
      })
      .filter(Boolean)
      .join("");
  }

  function formatLyricsForDisplay(html) {
    var s = String(html || "").trim();
    if (!s) return "";
    var hasHighlight = /lyric-hl/i.test(s);
    if (/<[a-z][\s\S]*>/i.test(s) && hasHighlight) {
      return newlinesToBrInLyricsHtml(s);
    }
    if (/<[a-z][\s\S]*>/i.test(s)) {
      return formatPlainLyricsToParagraphHtml(normalizePlainLyrics(htmlLyricsToPlain(s)));
    }
    return formatPlainLyricsToParagraphHtml(normalizePlainLyrics(s));
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

  function getPageFlipAudioContext() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!pageFlipAudioCtx) {
      try {
        pageFlipAudioCtx = new Ctx();
      } catch (e) {
        return null;
      }
    }
    return pageFlipAudioCtx;
  }

  function getPageFlipAudioElement() {
    if (!pageFlipAudioEl) {
      try {
        pageFlipAudioEl = new Audio(PAGE_FLIP_SOUND_SRC);
        pageFlipAudioEl.preload = "auto";
        pageFlipAudioEl.volume = 0.78;
      } catch (e) {
        pageFlipAudioEl = null;
      }
    }
    return pageFlipAudioEl;
  }

  function getDeleteSoundElement() {
    if (!deleteSoundEl) {
      try {
        deleteSoundEl = new Audio(DELETE_SOUND_SRC);
        deleteSoundEl.preload = "auto";
        deleteSoundEl.volume = 0.86;
      } catch (e) {
        deleteSoundEl = null;
      }
    }
    return deleteSoundEl;
  }

  function playDeleteSound() {
    var el = getDeleteSoundElement();
    if (!el || typeof el.play !== "function") return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch (e) {}
    var p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {});
    }
  }

  function unlockPageFlipAudio() {
    if (pageFlipAudioUnlocked) return;
    pageFlipAudioUnlocked = true;
    var el = getPageFlipAudioElement();
    if (el && typeof el.play === "function") {
      var wasMuted = el.muted;
      el.muted = true;
      var p = el.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          el.pause();
          try {
            el.currentTime = 0;
          } catch (e) {}
          el.muted = wasMuted;
        }).catch(function () {
          el.muted = wasMuted;
        });
      } else {
        el.muted = wasMuted;
      }
    }
    var ctx = getPageFlipAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume().catch(function () {});
    }
  }

  function playPageFlipSynthFallback() {
    var ctx = getPageFlipAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume().catch(function () {});
    }

    var dur = 0.16;
    var frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var lp = 0;
    for (var i = 0; i < frames; i++) {
      var t = i / frames;
      var env = Math.pow(1 - t, 1.45) * (0.84 + 0.16 * Math.sin(i * 0.19));
      var white = Math.random() * 2 - 1;
      lp = lp + 0.32 * (white - lp);
      data[i] = lp * env * 0.5;
    }

    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 420;
    var lpFilter = ctx.createBiquadFilter();
    lpFilter.type = "lowpass";
    lpFilter.frequency.value = 7200;
    var gain = ctx.createGain();
    var now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.34, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(hp);
    hp.connect(lpFilter);
    lpFilter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.03);
  }

  function playPageFlipSound() {
    var el = getPageFlipAudioElement();
    if (el && typeof el.play === "function") {
      try {
        el.pause();
        el.currentTime = 0;
      } catch (e) {}
      var p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () {
          playPageFlipSynthFallback();
        });
      }
      return;
    }
    playPageFlipSynthFallback();
  }

  function profileHrefFor(userId, displayName) {
    if (window.SongSharePublished && typeof window.SongSharePublished.userProfileHref === "function") {
      return window.SongSharePublished.userProfileHref(userId, displayName);
    }
    var uid = String(userId || "").trim();
    if (uid) return "user.html?uid=" + encodeURIComponent(uid);
    var dn = String(displayName || "").trim();
    if (dn) return "user.html?name=" + encodeURIComponent(dn);
    return "user.html";
  }

  function renderSongLinks(links) {
    var l = links || {};
    var options = [
      { key: "spotify", label: "Spotify" },
      { key: "appleMusic", label: "Apple Music" },
      { key: "youtube", label: "YouTube" },
    ];
    var $wrap = $(".js-song-links").empty();
    var count = 0;
    options.forEach(function (opt) {
      var href = String(l[opt.key] || "").trim();
      if (!href) return;
      count += 1;
      $wrap.append(
        $("<a/>", {
          class: "detail-song-link",
          href: href,
          target: "_blank",
          rel: "noopener noreferrer",
          text: opt.label,
        })
      );
    });
    if (count) {
      $wrap.removeAttr("hidden");
    } else {
      $wrap.attr("hidden", "");
    }
  }

  $(function () {
    document.addEventListener("pointerdown", unlockPageFlipAudio, {
      once: true,
      capture: true,
      passive: true,
    });

    function start() {
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

    function relayoutSongPageMarginStickies() {
      var innerEl = document.querySelector(".detail-lyrics-scroll-inner");
      if (!innerEl) return;
      $(".js-song-stickies .song-sticky").not(".song-sticky--legacy").each(function () {
        var $el = $(this);
        var fixed = $el.attr("data-top-px");
        if (fixed != null && fixed !== "") {
          var px = parseFloat(fixed, 10);
          if (!isNaN(px)) {
            $el.css("top", Math.round(px) + "px");
          }
          return;
        }
        var idx = parseInt($el.attr("data-hl-idx"), 10);
        if (isNaN(idx)) return;
        var hl = document.querySelectorAll(".js-song-lyrics .lyric-hl")[idx];
        if (!hl) return;
        var br = innerEl.getBoundingClientRect();
        var hr = hl.getBoundingClientRect();
        var centerY = hr.top - br.top + hr.height / 2;
        $el.css("top", Math.round(centerY) + "px");
      });
    }

    function renderStickies(notes) {
      var $z = $(".js-song-stickies").empty();
      var innerEl = document.querySelector(".detail-lyrics-scroll-inner");
      if (!notes || !notes.length) {
        $z.attr("aria-hidden", "true");
        return;
      }
      $z.removeAttr("aria-hidden");
      notes.forEach(function (n, i) {
        if (!n || typeof n !== "object") return;
        var hasHlIdx = typeof n.highlightIndex === "number" && !isNaN(n.highlightIndex);
        var hlIdx = hasHlIdx ? n.highlightIndex : i;
        var legacy =
          !hasHlIdx &&
          (n.left != null || n.top != null) &&
          (typeof n.left === "number" ||
            typeof n.left === "string" ||
            typeof n.top === "number" ||
            typeof n.top === "string");

        var $s = $("<div class=\"song-sticky\" />").text(n.text != null ? String(n.text) : "");
        if (legacy) {
          var left = typeof n.left === "number" ? n.left : parseFloat(n.left);
          var top = typeof n.top === "number" ? n.top : parseFloat(n.top);
          if (isNaN(left)) left = 8;
          if (isNaN(top)) top = 12;
          $s.addClass("song-sticky--legacy").css({ left: left + "%", top: top + "%" });
        } else {
          $s.addClass("song-sticky--right").attr("data-hl-idx", String(hlIdx));
          if (typeof n.topPx === "number" && !isNaN(n.topPx)) {
            $s.attr("data-top-px", String(n.topPx));
          }
          var sc = n.slipColor;
          if (sc && /^(amber|mint|rose|sky)$/.test(String(sc))) {
            $s.addClass("song-sticky--" + sc);
          }
        }
        $z.append($s);
      });
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(relayoutSongPageMarginStickies);
      });
    }

    function renderPageComments() {
      var session = window.SongShareAuth && window.SongShareAuth.getSession();
      var comments = window.SongShareModalComments ? window.SongShareModalComments.load(id, idx) : [];
      var $host = $(".js-page-comments").empty();

      var $feedInner = $('<div class="page-comments__feed-inner" aria-live="polite" />');
      if (!comments.length) {
        $feedInner.append('<p class="page-comments__empty">No comments yet.</p>');
      }

      comments.forEach(function (c) {
        if (!c || !c.body) return;
        var own = session && c.userId === session.userId;
        var commentBy = String(c.displayName || "Member").trim() || "Member";
        var commentByHref = profileHrefFor(c.userId, commentBy);
        var delBtn = own
          ? '<button type="button" class="page-comments__remove js-page-comment-remove" data-comment-id="' +
            escapeHtml(c.id) +
            '" aria-label="Delete your comment">×</button>'
          : "";
        $feedInner.append(
          '<div class="page-comments__item">' +
            delBtn +
            '<div class="page-comments__meta">' +
            '<a class="page-comments__author-link" href="' +
            escapeHtml(commentByHref) +
            '">' +
            escapeHtml(commentBy) +
            "</a>" +
            (c.ts ? " · " + escapeHtml(fmtWhen(c.ts)) : "") +
            "</div>" +
            '<div class="page-comments__text">' +
            escapeHtml(String(c.body)) +
            "</div></div>"
        );
      });

      $host.append(
        $('<h2 class="page-comments__heading" id="page-comments-heading">Comments</h2>'),
        $feedInner
      );

      if (session) {
        $host.append(
          '<label class="page-comments__label" for="page-comment-input">Your comment</label>',
          '<textarea id="page-comment-input" class="page-comments__input js-page-comment-input" rows="2" maxlength="600" spellcheck="true" placeholder="Write a comment…"></textarea>',
          '<button type="button" class="page-comments__post js-page-comment-post">Post</button>'
        );
      } else {
        $host.append(
          '<p class="page-comments__guest">Sign in to post comments.</p>',
          '<a class="page-comments__auth-link" href="home.html">Back to sign in</a>'
        );
      }
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
        var postedBy = String(t.displayName || "").trim();
        if (postedBy) {
          annParts.push(
            'Posted by <a class="detail-author-link" href="' +
              escapeHtml(profileHrefFor(t.userId, postedBy)) +
              '">' +
              escapeHtml(postedBy) +
              "</a>"
          );
        }
        if (t.songPublishedAt) annParts.push("Published " + fmtWhen(t.songPublishedAt));
      }
      if (annParts.length) {
        $(".js-annotation-meta").html(annParts.join(" · ")).removeAttr("hidden");
      } else {
        $(".js-annotation-meta").text("").attr("hidden", "");
      }
      renderSongLinks({
        spotify:
          (t.streamLinks && t.streamLinks.spotify) || t.spotifyUrl || "",
        appleMusic:
          (t.streamLinks && t.streamLinks.appleMusic) ||
          t.appleMusicUrl ||
          "",
        youtube:
          (t.streamLinks && t.streamLinks.youtube) || t.youtubeUrl || "",
      });

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
      var hasMeaning = !!mean;
      $(".detail-column--meaning").toggleClass("is-meaning-hidden", !hasMeaning);
      if (hasMeaning) {
        $(".js-meaning").html(formatMeaningForDisplay(mean));
      } else {
        $(".js-meaning").empty();
      }
      var by = String(t.meaningBy || "").trim();
      var metaParts = [];
      if (hasMeaning && by) {
        metaParts.push(
          '<a class="detail-author-link" href="' +
            escapeHtml(profileHrefFor(t.userId, by)) +
            '">' +
            escapeHtml(by) +
            "</a>"
        );
      }
      if (hasMeaning && t.meaningAt) metaParts.push(fmtWhen(t.meaningAt));
      if (metaParts.length) {
        $(".js-meaning-meta").html(metaParts.join(" · ")).removeAttr("hidden");
      } else {
        $(".js-meaning-meta").text("").attr("hidden", "");
      }

      document.title = (t.title || "Song") + " — " + g.name + " — Cr8Dig";
      syncNavLinks();
      renderPageComments();
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

    $(document).on("click", ".js-page-comment-post", function () {
      var sess = window.SongShareAuth && window.SongShareAuth.getSession();
      if (!sess || !window.SongShareModalComments) return;
      var body = String($(".js-page-comments .js-page-comment-input").val() || "").trim();
      if (!body) return;
      window.SongShareModalComments.append(id, idx, {
        id: "c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10),
        userId: sess.userId,
        displayName: sess.displayName || sess.email || "Member",
        body: body,
        ts: new Date().toISOString(),
      });
      $(".js-page-comments .js-page-comment-input").val("");
      renderPageComments();
    });

    $(document).on("click", ".js-page-comment-remove", function () {
      var cid = $(this).attr("data-comment-id");
      var sess = window.SongShareAuth && window.SongShareAuth.getSession();
      if (!sess || !cid || !window.SongShareModalComments) return;
      window.SongShareModalComments.removeById(id, idx, cid);
      playDeleteSound();
      renderPageComments();
    });

    $(".js-prev").on("click", function (e) {
      e.stopPropagation();
      idx = (idx - 1 + tracks.length) % tracks.length;
      playPageFlipSound();
      showTrack(true, "prev");
      syncSongUrl(id, idx);
    });

    $(".js-next").on("click", function (e) {
      e.stopPropagation();
      idx = (idx + 1) % tracks.length;
      playPageFlipSound();
      showTrack(true, "next");
      syncSongUrl(id, idx);
    });

    $(".js-close").on("click", function () {
      window.location.href = "home.html";
    });

    var lyricsSlipLayoutTimer = null;
    $(window).on("resize", function () {
      if (lyricsSlipLayoutTimer) window.clearTimeout(lyricsSlipLayoutTimer);
      lyricsSlipLayoutTimer = window.setTimeout(function () {
        lyricsSlipLayoutTimer = null;
        relayoutSongPageMarginStickies();
      }, 120);
    });
    }

    var _pull = Promise.resolve();
    if (window.SongShareRemoteSync && typeof window.SongShareRemoteSync.whenReady === "function") {
      _pull = window.SongShareRemoteSync.whenReady();
    }
    _pull.then(start).catch(start);
  });
})(jQuery);
