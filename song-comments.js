/**
 * Viewer comments on the meaning notebook overlay only.
 * Separate from publisher annotations (margin slips on the lyrics overlay / stickyNotes).
 * Keyed by genre id + track index; stored in localStorage.
 */
(function (global) {
  "use strict";

  var PREFIX = "songShareModalCommentsV1:";

  function storageKey(genreId, trackIdx) {
    return PREFIX + String(genreId) + ":" + String(trackIdx);
  }

  function load(genreId, trackIdx) {
    try {
      var raw = localStorage.getItem(storageKey(genreId, trackIdx));
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function save(genreId, trackIdx, items) {
    localStorage.setItem(storageKey(genreId, trackIdx), JSON.stringify(items));
  }

  function append(genreId, trackIdx, item) {
    var items = load(genreId, trackIdx);
    items.unshift(item);
    save(genreId, trackIdx, items);
    return items;
  }

  function removeById(genreId, trackIdx, commentId) {
    if (!commentId) return load(genreId, trackIdx);
    var next = load(genreId, trackIdx).filter(function (x) {
      return x.id !== commentId;
    });
    save(genreId, trackIdx, next);
    return next;
  }

  global.SongShareModalComments = {
    load: load,
    append: append,
    removeById: removeById,
  };
})(window);
