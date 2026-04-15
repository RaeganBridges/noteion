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

  function normalizeAlbumTrack(raw, fallbackPubId) {
    if (!raw || typeof raw !== "object") return null;
    var tid = raw.pubId || raw.id || fallbackPubId;
    if (!tid) return null;
    var lyricsHtml = raw.lyricsHtml || "";
    if (!lyricsHtml && raw.notes) {
      lyricsHtml = "<div>" + escapeBr(raw.notes) + "</div>";
    }
    return {
      pubId: tid,
      title: raw.title || "Untitled",
      artist: raw.artist || "",
      lyricsHtml: lyricsHtml,
      meaningText: raw.meaningText || "",
      meaningAuthor: raw.meaningAuthor || "",
      meaningPublishedAt: raw.meaningPublishedAt || null,
      songPublishedAt: raw.songPublishedAt || raw.createdAt || Date.now(),
      genreTags: Array.isArray(raw.genreTags) ? raw.genreTags : [],
      stickyNotes: Array.isArray(raw.stickyNotes) ? raw.stickyNotes : [],
      audioName: raw.audioName || "",
      audioDataUrl: raw.audioDataUrl || "",
    };
  }

  function normalizeItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    var pubId = raw.pubId || raw.id;
    if (!pubId) return null;
    if (raw.kind === "album") {
      var tracksIn = Array.isArray(raw.tracks) ? raw.tracks : [];
      var tracks = tracksIn
        .map(function (t, i) {
          return normalizeAlbumTrack(t, pubId + "_tr_" + i);
        })
        .filter(Boolean);
      return {
        kind: "album",
        pubId: pubId,
        albumTitle: raw.albumTitle || "Untitled album",
        albumArtist: raw.albumArtist || "",
        albumCoverDataUrl: raw.albumCoverDataUrl || "",
        tracks: tracks,
        createdAt: raw.createdAt || Date.now(),
      };
    }
    var lyricsHtml = raw.lyricsHtml || "";
    if (!lyricsHtml && raw.notes) {
      lyricsHtml = "<div>" + escapeBr(raw.notes) + "</div>";
    }
    return {
      kind: "song",
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
      albumCoverDataUrl: raw.albumCoverDataUrl || "",
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

  function stripUploadHeavyPayload(items) {
    return (items || []).map(function (it) {
      if (!it || typeof it !== "object") return it;
      var next = Object.assign({}, it);
      if (next.albumCoverDataUrl) next.albumCoverDataUrl = "";
      if (next.kind === "album" && Array.isArray(next.tracks)) {
        next.tracks = next.tracks.map(function (tr) {
          if (!tr || typeof tr !== "object") return tr;
          var t = Object.assign({}, tr);
          if (t.audioDataUrl) t.audioDataUrl = "";
          return t;
        });
      }
      return next;
    });
  }

  function save(userId, items) {
    var key = storageKey(userId);
    var payload = Array.isArray(items) ? items : [];
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      return;
    } catch (e1) {}

    var compact = stripUploadHeavyPayload(payload);
    try {
      localStorage.setItem(key, JSON.stringify(compact));
      return;
    } catch (e2) {}

    // Last resort: keep newest cards first and trim until it fits.
    var trimmed = compact.slice();
    while (trimmed.length) {
      trimmed.pop();
      try {
        localStorage.setItem(key, JSON.stringify(trimmed));
        return;
      } catch (e3) {}
    }
  }

  function add(userId, item) {
    var normalized = normalizeItem(item);
    if (!normalized) {
      normalized = {
        kind: "song",
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
        albumCoverDataUrl: item.albumCoverDataUrl || "",
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
    var before = list(userId);
    var victim = before.find(function (x) {
      return x.pubId === pubId;
    });
    var items = before.filter(function (x) {
      return x.pubId !== pubId;
    });
    save(userId, items);
    if (global.SongSharePublished) {
      if (victim && victim.kind === "album" && Array.isArray(victim.tracks)) {
        victim.tracks.forEach(function (t) {
          if (t && t.pubId) global.SongSharePublished.removeById(t.pubId);
        });
      } else {
        global.SongSharePublished.removeById(pubId);
      }
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
