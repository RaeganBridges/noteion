/**
 * lyrics.ovh — free lookup (third-party API; availability varies).
 * normalizeLyricsPlainText: fixes APIs that glue lines (e.g. "hairWarm smell").
 */
(function (global) {
  "use strict";

  /**
   * Restore line breaks when lyrics arrive as one block or with merged words.
   * Preserves existing newlines; only runs heuristics when the text looks "flat".
   */
  function normalizeLyricsPlainText(raw) {
    var s = String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim();
    if (!s) return s;
    var newlineCount = (s.match(/\n/g) || []).length;
    /* Skip heuristics when the text already looks line-broken or is very short. */
    if (newlineCount >= 14 || s.length < 90) {
      return s;
    }
    var prev;
    do {
      prev = s;
      s = s.replace(/([a-z])([A-Z][a-z])/g, "$1\n$2");
    } while (s !== prev);
    s = s.replace(/([.!?])([A-Z"'(])/g, "$1\n$2");
    s = s.replace(/([;:])\s*([A-Z][a-z])/g, "$1\n$2");
    s = s.replace(/,([A-Z][a-z])/g, ",\n$1");
    return s;
  }

  function getLyrics(artist, title) {
    var a = String(artist || "").trim();
    var t = String(title || "").trim();
    if (!a || !t) {
      return Promise.reject(new Error("Artist and title required."));
    }
    var url =
      "https://api.lyrics.ovh/v1/" + encodeURIComponent(a) + "/" + encodeURIComponent(t);
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("Request failed");
        return r.json();
      })
      .then(function (data) {
        if (!data || data.error) throw new Error((data && data.error) || "Not found");
        return { lyrics: normalizeLyricsPlainText(String(data.lyrics || "")) };
      });
  }

  function suggest(query) {
    var q = String(query || "").trim();
    if (!q) return Promise.resolve([]);
    return fetch("https://api.lyrics.ovh/suggest/" + encodeURIComponent(q))
      .then(function (r) {
        if (!r.ok) throw new Error("Suggest failed");
        return r.json();
      })
      .then(function (data) {
        return (data && data.data) || [];
      });
  }

  global.SongShareLyrics = {
    getLyrics: getLyrics,
    suggest: suggest,
    normalizeLyricsPlainText: normalizeLyricsPlainText,
  };
})(window);
