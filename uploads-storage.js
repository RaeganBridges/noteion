/**
 * User's desk — published snapshots (per user). Removing a card also unpublishes from the feed.
 */
(function (global) {
  "use strict";

  function storageKey(userId) {
    return "songShareUploads_" + String(userId);
  }

  function escapeBr(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    var pubId = raw.pubId || raw.id;
    if (!pubId) return null;
    var lyricsHtml = raw.lyricsHtml || "";
    if (!lyricsHtml && raw.notes) {
      lyricsHtml = "<div>" + escapeBr(raw.notes) + "</div>";
    }
    return {
      pubId: pubId,
      title: raw.title || "Untitled",
      artist: raw.artist || "",
      lyricsHtml: lyricsHtml,
      meaningText: raw.meaningText || "",
      meaningAuthor: raw.meaningAuthor || "",
      meaningPublishedAt: raw.meaningPublishedAt || null,
      songPublishedAt: raw.songPublishedAt || raw.createdAt || Date.now(),
      genreTags: Array.isArray(raw.genreTags) ? raw.genreTags : [],
      stickyNotes: Array.isArray(raw.stickyNotes) ? raw.stickyNotes : [],
      createdAt: raw.createdAt || raw.songPublishedAt || Date.now(),
    };
  }

  function list(userId) {
    if (!userId) return [];
    try {
      var raw = localStorage.getItem(storageKey(userId));
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr
        .map(normalizeItem)
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function save(userId, items) {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
  }

  function add(userId, item) {
    var normalized = normalizeItem(item);
    if (!normalized) {
      normalized = {
        pubId: "pub_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
        title: item.title || "Untitled",
        artist: item.artist || "",
        lyricsHtml: item.lyricsHtml || "",
        meaningText: item.meaningText || "",
        meaningAuthor: item.meaningAuthor || "",
        meaningPublishedAt: item.meaningPublishedAt || null,
        songPublishedAt: item.songPublishedAt || Date.now(),
        genreTags: Array.isArray(item.genreTags) ? item.genreTags : [],
        stickyNotes: Array.isArray(item.stickyNotes) ? item.stickyNotes : [],
        createdAt: item.songPublishedAt || Date.now(),
      };
    }
    var items = list(userId).filter(function (x) {
      return x.pubId !== normalized.pubId;
    });
    items.unshift(normalized);
    save(userId, items);
    return items;
  }

  function remove(userId, pubId) {
    if (!pubId) return list(userId);
    var items = list(userId).filter(function (x) {
      return x.pubId !== pubId;
    });
    save(userId, items);
    if (global.SongSharePublished) {
      global.SongSharePublished.removeById(pubId);
      global.SongSharePublished.applyMerge();
    }
    return items;
  }

  global.SongShareUploads = {
    list: list,
    add: add,
    remove: remove,
  };
})(window);
