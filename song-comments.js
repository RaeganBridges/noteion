/**
 * Viewer comments on the song page (song.html).
 * - For published tracks (`pubId` present), comments are stored on the published post
 *   payload so they sync to all users.
 * - For demo/non-published tracks, falls back to localStorage by genre+track index.
 */
(function (global) {
  "use strict";

  var PREFIX = "songShareModalCommentsV1:";

  function storageKey(genreId, trackIdx) {
    return PREFIX + String(genreId) + ":" + String(trackIdx);
  }

  function normalizeComments(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (c) {
      return c && typeof c === "object" && String(c.body || "").trim();
    });
  }

  function loadLocal(genreId, trackIdx) {
    try {
      var raw = localStorage.getItem(storageKey(genreId, trackIdx));
      var arr = raw ? JSON.parse(raw) : [];
      return normalizeComments(arr);
    } catch (e) {
      return [];
    }
  }

  function saveLocal(genreId, trackIdx, items) {
    localStorage.setItem(storageKey(genreId, trackIdx), JSON.stringify(normalizeComments(items)));
  }

  function findPublishedPost(pubId) {
    var SP = global.SongSharePublished;
    if (!pubId || !SP || typeof SP.loadAll !== "function") return null;
    var all = SP.loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].id === pubId) return all[i];
    }
    return null;
  }

  function load(genreId, trackIdx, pubId) {
    if (pubId) {
      var post = findPublishedPost(pubId);
      return post ? normalizeComments(post.comments) : [];
    }
    return loadLocal(genreId, trackIdx);
  }

  function saveShared(pubId, items) {
    var SP = global.SongSharePublished;
    if (!pubId || !SP || typeof SP.upsert !== "function") return normalizeComments(items);
    var post = findPublishedPost(pubId);
    if (!post) return normalizeComments(items);
    var next = Object.assign({}, post, {
      comments: normalizeComments(items),
      updatedAt: new Date().toISOString(),
    });
    SP.upsert(next);
    if (typeof SP.applyMerge === "function") {
      SP.applyMerge();
    }
    return next.comments;
  }

  function append(genreId, trackIdx, item, pubId) {
    var items = load(genreId, trackIdx, pubId);
    items.unshift(item);
    if (pubId) {
      return saveShared(pubId, items);
    }
    saveLocal(genreId, trackIdx, items);
    return items;
  }

  function removeById(genreId, trackIdx, commentId, pubId) {
    if (!commentId) return load(genreId, trackIdx, pubId);
    var next = load(genreId, trackIdx, pubId).filter(function (x) {
      return x.id !== commentId;
    });
    if (pubId) {
      return saveShared(pubId, next);
    }
    saveLocal(genreId, trackIdx, next);
    return next;
  }

  global.SongShareModalComments = {
    load: load,
    append: append,
    removeById: removeById,
  };
})(window);
