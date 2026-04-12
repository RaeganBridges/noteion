(function ($) {
  "use strict";

  function qp(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
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

  function getTracks(g) {
    if (g.tracks && g.tracks.length) return g.tracks;
    if (g.songs && g.songs.length) {
      return g.songs.map(function (title) {
        return { title: title };
      });
    }
    return [{ title: "—" }];
  }

  function setStatus(msg, isErr) {
    var $s = $("#reader-status");
    $s.text(msg || "");
    $s.toggleClass("reader-error", !!isErr);
  }

  $(function () {
    function start() {
    var genres = window.SONG_SHARE_GENRES || [];
    var id = parseInt(qp("id"), 10);
    var trackIdx = parseInt(qp("track"), 10);
    if (isNaN(trackIdx)) trackIdx = 0;

    var qTitle = qp("q");
    var qArtist = qp("artist");

    var $title = $("#reader-title");
    var $artist = $("#reader-artist");
    var $meta = $("#reader-meta");
    var $lyrics = $("#reader-lyrics");
    var $back = $("#reader-back-song");

    function showTrack(t) {
      t = t || {};
      $title.text(t.title || qTitle || "—");
      var artist = String(t.artist || t.songArtist || qArtist || "").trim();
      if (artist) {
        $artist.text(artist).removeAttr("hidden");
      } else {
        $artist.text("").attr("hidden", "");
      }
      $meta.text("");
      $back.attr("href", "song.html?id=" + encodeURIComponent(String(id)) + "&track=" + encodeURIComponent(String(trackIdx)));
    }

    function applyLyricsHtml(html) {
      var f = formatLyricsForDisplay(html);
      if (f) {
        $lyrics.html(f);
      } else {
        $lyrics.text("No lyrics loaded yet.");
      }
    }

    function runFetch(artist, title) {
      if (!window.SongShareLyrics) {
        setStatus("Lyrics lookup unavailable.", true);
        return;
      }
      setStatus("Loading lyrics…");
      window.SongShareLyrics.getLyrics(artist, title)
        .then(function (data) {
          setStatus("");
          applyLyricsHtml(data && data.lyrics ? data.lyrics : "");
        })
        .catch(function () {
          setStatus("Could not load lyrics for that artist/title.", true);
        });
    }

    if (id && !isNaN(id) && id >= 1 && id <= genres.length) {
      var g = genres[id - 1];
      var tracks = getTracks(g);
      trackIdx = Math.max(0, Math.min(trackIdx, tracks.length - 1));
      var t = tracks[trackIdx];
      showTrack(t);
      document.title = (t.title || "Song") + " — Lyrics — Noteion";
      $(".reader-header-tagline").text((g && g.name) || "Genre");

      if (t.lyricsHtml && String(t.lyricsHtml).trim()) {
        setStatus("");
        applyLyricsHtml(t.lyricsHtml);
      } else {
        var a = String(t.artist || t.songArtist || "").trim();
        var ti = String(t.title || "").trim();
        if (a && ti) {
          runFetch(a, ti);
        } else if (qArtist && qTitle) {
          runFetch(qArtist, qTitle);
        } else {
          setStatus("No saved lyrics. Add artist & title on the song sheet or fetch from profile.");
        }
      }
      return;
    }

    /* Ad-hoc search from home */
    showTrack({ title: qTitle, artist: qArtist });
    document.title = (qTitle || "Lyrics") + " — Noteion";
    $back.attr("href", "home.html");
    if (qArtist && qTitle) {
      runFetch(qArtist, qTitle);
    } else if (qTitle && window.SongShareLyrics) {
      setStatus("Searching…");
      window.SongShareLyrics.suggest(qTitle)
        .then(function (items) {
          if (!items || !items.length) {
            setStatus("No matches. Add artist in the search form.", true);
            return;
          }
          var first = items[0];
          var art = first.artist && first.artist.name ? first.artist.name : "";
          var tit = first.title_short || first.title || qTitle;
          if (!art) {
            setStatus("Pick a result with a known artist from the home search.", true);
            return;
          }
          $title.text(tit);
          $artist.text(art).removeAttr("hidden");
          return window.SongShareLyrics.getLyrics(art, tit);
        })
        .then(function (data) {
          if (!data || !data.lyrics) return;
          setStatus("");
          applyLyricsHtml(data.lyrics);
        })
        .catch(function () {
          setStatus("Lookup failed.", true);
        });
    } else {
      setStatus("Open a song from the board or search from home.", true);
    }
    }

    var _pull = Promise.resolve();
    if (window.SongShareRemoteSync && typeof window.SongShareRemoteSync.whenReady === "function") {
      _pull = window.SongShareRemoteSync.whenReady();
    }
    _pull.then(start).catch(start);
  });
})(jQuery);
