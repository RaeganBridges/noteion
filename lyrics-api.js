/**
 * lyrics.ovh — free lookup (third-party API; availability varies).
 */
(function (global) {
  "use strict";

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
        return { lyrics: String(data.lyrics || "") };
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
  };
})(window);
