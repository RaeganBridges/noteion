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

  function formatLyricsForDisplay(html, track) {
    track = track || {};
    var s = String(html || "").trim();
    if (!s) return "";
    var hasHighlight = /lyric-hl/i.test(s);
    var stickyLen = Array.isArray(track.stickyNotes) ? track.stickyNotes.length : 0;
    if (/<[a-z][\s\S]*>/i.test(s) && (hasHighlight || stickyLen > 0)) {
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

    function fmtRelease(ts) {
      if (ts == null || ts === "") return "";
      try {
        return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
      } catch (e) {
        return "";
      }
    }

    function renderReaderMeta(t, boardGenre) {
      t = t || {};
      $meta.empty();
      var released = fmtRelease(t.songPublishedAt || t.createdAt);
      if (released) {
        $meta.append($("<span/>", { class: "reader-meta-line", text: "Released " + released }));
      }
      var SP = window.SongSharePublished;
      var tags =
        SP && typeof SP.displayGenreTagsWithAllSlot === "function"
          ? SP.displayGenreTagsWithAllSlot(t.genreTags, boardGenre)
          : [];
      if (!tags.length) return;
      if (released) {
        $meta.append($("<br/>"));
      }
      var genres = window.SONG_SHARE_GENRES || [];
      var $row = $("<span/>", { class: "reader-genre-tags" });
      tags.forEach(function (tag, i) {
        if (i) {
          $row.append(document.createTextNode(" · "));
        }
        var hsl =
          SP && typeof SP.genreBoardHslByName === "function" ? SP.genreBoardHslByName(String(tag).trim()) : "";
        var crateHref = "";
        for (var j = 0; j < genres.length; j++) {
          if (genres[j] && String(genres[j].name || "").trim() === String(tag).trim()) {
            crateHref = "crate.html?genre=" + encodeURIComponent(String(j + 1));
            break;
          }
        }
        var $chip;
        if (crateHref) {
          $chip = $("<a/>", {
            class: "reader-genre-chip",
            href: crateHref,
            text: tag,
            title: "Open " + tag + " crate",
          });
        } else {
          $chip = $("<span/>", { class: "reader-genre-chip", text: tag });
        }
        if (hsl) {
          $chip.css("color", hsl);
        } else {
          $chip.addClass("reader-genre-chip--fallback");
        }
        $row.append($chip);
      });
      $meta.append($row);
    }

    function showTrack(t, boardGenre) {
      t = t || {};
      $title.text(t.title || qTitle || "—");
      var artist = String(t.artist || t.songArtist || qArtist || "").trim();
      if (artist) {
        var artistHref =
          window.SongSharePublished && typeof window.SongSharePublished.artistProfileHref === "function"
            ? window.SongSharePublished.artistProfileHref(artist)
            : "artist.html?name=" + encodeURIComponent(artist);
        $artist
          .html(
            '<a class="reader-artist-link" href="' +
              escapeHtml(artistHref) +
              '">' +
              escapeHtml(artist) +
              "</a>"
          )
          .removeAttr("hidden");
      } else {
        $artist.empty().attr("hidden", "");
      }
      renderReaderMeta(t, boardGenre || null);
      $back.attr("href", "song.html?id=" + encodeURIComponent(String(id)) + "&track=" + encodeURIComponent(String(trackIdx)));
    }

    function applyLyricsHtml(html, track) {
      var f = formatLyricsForDisplay(html, track || {});
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
          applyLyricsHtml(data && data.lyrics ? data.lyrics : "", {});
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
      showTrack(t, g);
      document.title = (t.title || "Song") + " — Lyrics — Cr8Dig";
      $(".reader-header-tagline").text((g && g.name) || "Genre");

      if (t.lyricsHtml && String(t.lyricsHtml).trim()) {
        setStatus("");
        applyLyricsHtml(t.lyricsHtml, t);
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
    showTrack({ title: qTitle, artist: qArtist }, null);
    document.title = (qTitle || "Lyrics") + " — Cr8Dig";
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
          var ah =
            window.SongSharePublished && typeof window.SongSharePublished.artistProfileHref === "function"
              ? window.SongSharePublished.artistProfileHref(art)
              : "artist.html?name=" + encodeURIComponent(art);
          $artist
            .html(
              '<a class="reader-artist-link" href="' + escapeHtml(ah) + '">' + escapeHtml(art) + "</a>"
            )
            .removeAttr("hidden");
          renderReaderMeta({}, null);
          return window.SongShareLyrics.getLyrics(art, tit);
        })
        .then(function (data) {
          if (!data || !data.lyrics) return;
          setStatus("");
          applyLyricsHtml(data.lyrics, {});
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
