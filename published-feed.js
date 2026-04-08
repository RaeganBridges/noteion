/**
 * Community-published songs (localStorage). Merged into genre track lists on load.
 */
(function (global) {
  "use strict";

  var KEY = "songSharePublishedV1";

  function loadAll() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveAll(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function toDisplayTrack(p) {
    return {
      title: p.title || "Untitled",
      artist: p.artist || "",
      songPublishedAt: p.songPublishedAt || null,
      songArtist: p.artist || "",
      displayName: p.displayName || "",
      userPublished: true,
      pubId: p.id,
    };
  }

  /**
   * Per genre: if any published songs are tagged with that genre name, show only those;
   * otherwise keep bundled demo tracks.
   */
  function mergeGenres(genres) {
    if (!genres || !genres.length) return genres;
    var published = loadAll();
    var baseList = global.SONG_SHARE_GENRES_BASE || genres;
    return genres.map(function (g, i) {
      var userTracks = published
        .filter(function (p) {
          return (p.genreTags || []).indexOf(g.name) !== -1;
        })
        .map(toDisplayTrack);
      var baseG = baseList[i] && baseList[i].name === g.name ? baseList[i] : baseList.find(function (b) { return b.name === g.name; });
      var baseTracks = baseG && baseG.tracks && baseG.tracks.length ? baseG.tracks.slice() : [];
      return {
        name: g.name,
        audio: (g && g.audio) || (baseG && baseG.audio) || "",
        inspiredByArtists: (g && g.inspiredByArtists) || (baseG && baseG.inspiredByArtists),
        tracks: userTracks.length ? userTracks : baseTracks,
      };
    });
  }

  function add(entry) {
    var all = loadAll();
    all.unshift(entry);
    saveAll(all);
    return all;
  }

  function upsert(entry) {
    if (!entry || !entry.id) return loadAll();
    var next = loadAll().filter(function (x) {
      return x.id !== entry.id;
    });
    next.unshift(entry);
    saveAll(next);
    return next;
  }

  function removeById(pubId) {
    if (!pubId) return loadAll();
    var next = loadAll().filter(function (x) {
      return x.id !== pubId;
    });
    saveAll(next);
    return next;
  }

  function applyMerge() {
    if (!global.SONG_SHARE_GENRES || !global.SONG_SHARE_GENRES.length) return;
    global.SONG_SHARE_GENRES = mergeGenres(global.SONG_SHARE_GENRES);
  }

  global.SongSharePublished = {
    loadAll: loadAll,
    add: add,
    upsert: upsert,
    removeById: removeById,
    mergeGenres: mergeGenres,
    applyMerge: applyMerge,
  };

  applyMerge();
})(window);
