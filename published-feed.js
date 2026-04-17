/**
 * Community-published songs: localStorage plus optional Supabase `community_posts`.
 */
(function (global) {
  "use strict";

  var KEY = "songSharePublishedV1";

  /** Entries loaded from Supabase (remote wins over local when ids collide). */
  var remoteEntries = null;

  function loadLocalOnly() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function loadAll() {
    var merged = {};
    loadLocalOnly().forEach(function (p) {
      if (p && p.id) merged[p.id] = p;
    });
    if (remoteEntries && remoteEntries.length) {
      remoteEntries.forEach(function (p) {
        if (p && p.id) merged[p.id] = p;
      });
    }
    return Object.keys(merged).map(function (k) {
      return merged[k];
    });
  }

  function stripPublishedCoverPayload(items) {
    return (items || []).map(function (p) {
      if (!p || typeof p !== "object") return p;
      var next = Object.assign({}, p);
      if (next.albumCoverDataUrl) next.albumCoverDataUrl = "";
      return next;
    });
  }

  function saveAll(items) {
    var payload = Array.isArray(items) ? items : [];
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      return;
    } catch (e1) {}

    var compact = stripPublishedCoverPayload(payload);
    try {
      localStorage.setItem(KEY, JSON.stringify(compact));
      return;
    } catch (e2) {}

    // Last resort: keep newest entries first and trim until it fits.
    var trimmed = compact.slice();
    while (trimmed.length) {
      trimmed.pop();
      try {
        localStorage.setItem(KEY, JSON.stringify(trimmed));
        return;
      } catch (e3) {}
    }
  }

  function persistRemoteUpsert(entry) {
    var sb = global.songShareSupabaseClient;
    if (!sb || !entry || !entry.id) return;
    sb.auth.getSession().then(function (r) {
      var sess = r.data && r.data.session;
      if (!sess || !sess.user) return;
      sb.from("community_posts")
        .upsert(
          {
            id: String(entry.id),
            user_id: sess.user.id,
            payload: entry,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .then(function (result) {
          var err = result && result.error;
          if (err && typeof console !== "undefined" && console.warn) {
            console.warn("Noteion sync:", err.message || err);
          }
        });
    });
  }

  function persistRemoteDelete(pubId) {
    var sb = global.songShareSupabaseClient;
    if (!sb || !pubId) return;
    sb.auth.getSession().then(function (r) {
      var sess = r.data && r.data.session;
      if (!sess || !sess.user) return;
      sb.from("community_posts")
        .delete()
        .eq("id", String(pubId))
        .then(function (result) {
          var err = result && result.error;
          if (err && typeof console !== "undefined" && console.warn) {
            console.warn("Noteion delete sync:", err.message || err);
          }
        });
    });
  }

  function yearFromTimestamp(ts) {
    if (ts == null || ts === "") return null;
    try {
      var y = new Date(ts).getFullYear();
      return isNaN(y) ? null : y;
    } catch (e) {
      return null;
    }
  }

  function hashToHue(str) {
    var s = String(str || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) % 360;
    }
    return h;
  }

  function escapeXml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function makeSongFallbackCoverDataUrl(track, genreName, salt) {
    var title = String((track && track.title) || "Untitled");
    var artist = String((track && track.artist) || "");
    var seed = (track && (track.pubId || track.id)) || title + "|" + artist + "|" + String(salt || "");
    var hue = hashToHue(seed + "|" + String(genreName || ""));
    var hueB = (hue + 32) % 360;
    var initials = (title.trim() ? title.trim().slice(0, 2) : "S").toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="hsl(' + hue + ',78%,52%)"/>' +
      '<stop offset="100%" stop-color="hsl(' + hueB + ',72%,34%)"/>' +
      "</linearGradient></defs>" +
      '<rect width="600" height="600" fill="url(#g)"/>' +
      '<rect x="24" y="24" width="552" height="552" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>' +
      '<text x="52" y="86" fill="rgba(255,255,255,0.88)" font-size="30" font-family="sans-serif" font-weight="700">' +
      escapeXml(String(genreName || "Genre")) +
      "</text>" +
      '<text x="52" y="548" fill="rgba(255,255,255,0.94)" font-size="34" font-family="sans-serif" font-weight="700">' +
      escapeXml(title.slice(0, 28)) +
      "</text>" +
      '<text x="300" y="350" text-anchor="middle" fill="rgba(255,255,255,0.22)" font-size="180" font-family="sans-serif" font-weight="800">' +
      escapeXml(initials) +
      "</text>" +
      "</svg>";
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  function toDisplayTrack(p) {
    var meaningText = p.meaningText != null ? String(p.meaningText).trim() : "";
    var releaseYear =
      typeof p.releaseYear === "number" && !isNaN(p.releaseYear)
        ? p.releaseYear
        : yearFromTimestamp(p.songPublishedAt);
    return {
      title: p.title || "Untitled",
      artist: p.artist || "",
      songPublishedAt: p.songPublishedAt || null,
      songArtist: p.artist || "",
      displayName: p.displayName || "",
      userId: p.userId || "",
      streamLinks:
        p.streamLinks && typeof p.streamLinks === "object"
          ? {
              spotify: p.streamLinks.spotify || "",
              appleMusic: p.streamLinks.appleMusic || "",
              youtube: p.streamLinks.youtube || "",
            }
          : { spotify: "", appleMusic: "", youtube: "" },
      userPublished: true,
      pubId: p.id,
      lyricsHtml: p.lyricsHtml || "",
      meaning: meaningText,
      meaningBy: p.meaningAuthor || "",
      meaningAt: p.meaningPublishedAt || null,
      stickyNotes: Array.isArray(p.stickyNotes) ? p.stickyNotes : [],
      releaseYear: releaseYear,
      albumId: p.albumId || "",
      albumTitle: p.albumTitle || "",
      albumArtist: p.albumArtist || "",
      albumTrackIndex:
        typeof p.albumTrackIndex === "number" && !isNaN(p.albumTrackIndex) ? p.albumTrackIndex : null,
      albumCoverDataUrl: p.albumCoverDataUrl || "",
    };
  }

  /** Board slot that aggregates every published song (not a tag users pick when posting). */
  var ALL_GENRES_SLOT_NAME = "All genres";

  /**
   * Per genre: if any published songs are tagged with that genre name, show only those;
   * for the "All genres" slot, show every published song (newest first);
   * otherwise keep bundled demo tracks.
   */
  function mergeGenres(genres) {
    if (!genres || !genres.length) return genres;
    var published = loadAll();
    var baseList = global.SONG_SHARE_GENRES_BASE || genres;
    return genres.map(function (g, i) {
      var userTracks;
      if (g.name === ALL_GENRES_SLOT_NAME) {
        userTracks = published
          .slice()
          .sort(function (a, b) {
            var ta = a.songPublishedAt || a.createdAt || 0;
            var tb = b.songPublishedAt || b.createdAt || 0;
            return tb - ta;
          })
          .map(toDisplayTrack);
      } else {
        userTracks = published
          .filter(function (p) {
            return (p.genreTags || []).indexOf(g.name) !== -1;
          })
          .map(toDisplayTrack);
      }
      var boardStackCoverUrl = "";
      var boardStackCoverUrls = [];
      var seenCover = {};
      var maxCovers = 16;
      for (var bi = 0; bi < userTracks.length && boardStackCoverUrls.length < maxCovers; bi++) {
        var track = userTracks[bi];
        var bc = track && track.albumCoverDataUrl ? String(track.albumCoverDataUrl).trim() : "";
        var cs = bc || makeSongFallbackCoverDataUrl(track, g.name, bi);
        if (!cs) continue;
        if (seenCover[cs]) {
          // If two songs share the same cover, force a song-specific fallback for variety.
          cs = makeSongFallbackCoverDataUrl(track, g.name, bi + "_" + String(track && track.pubId || ""));
        }
        if (seenCover[cs]) continue;
        seenCover[cs] = true;
        boardStackCoverUrls.push(cs);
        if (!boardStackCoverUrl) boardStackCoverUrl = cs;
      }
      var baseG = baseList[i] && baseList[i].name === g.name ? baseList[i] : baseList.find(function (b) { return b.name === g.name; });
      var baseTracks = baseG && baseG.tracks && baseG.tracks.length ? baseG.tracks.slice() : [];
      return {
        name: g.name,
        audio: (g && g.audio) || (baseG && baseG.audio) || "",
        audioFallback:
          (g && g.audioFallback) || (baseG && baseG.audioFallback) || "",
        clipSlug: (g && g.clipSlug) || (baseG && baseG.clipSlug) || "",
        audioHoverMaxSec:
          g && g.audioHoverMaxSec != null
            ? g.audioHoverMaxSec
            : baseG && baseG.audioHoverMaxSec != null
              ? baseG.audioHoverMaxSec
              : undefined,
        audioHoverPreload:
          g && g.audioHoverPreload != null
            ? g.audioHoverPreload
            : baseG && baseG.audioHoverPreload != null
              ? baseG.audioHoverPreload
              : undefined,
        audioHoverStartSec:
          g && g.audioHoverStartSec != null
            ? g.audioHoverStartSec
            : baseG && baseG.audioHoverStartSec != null
              ? baseG.audioHoverStartSec
              : undefined,
        inspiredByArtists: (g && g.inspiredByArtists) || (baseG && baseG.inspiredByArtists),
        tracks: userTracks.length ? userTracks : baseTracks,
        boardAlbums: (baseG && baseG.boardAlbums) || (g && g.boardAlbums),
        boardStackCoverUrl: boardStackCoverUrl,
        boardStackCoverUrls: boardStackCoverUrls,
      };
    });
  }

  function add(entry) {
    var all = loadAll();
    all.unshift(entry);
    saveAll(all);
    persistRemoteUpsert(entry);
    return all;
  }

  function upsert(entry) {
    if (!entry || !entry.id) return loadAll();
    var next = loadAll().filter(function (x) {
      return x.id !== entry.id;
    });
    next.unshift(entry);
    saveAll(next);
    persistRemoteUpsert(entry);
    return next;
  }

  function removeById(pubId) {
    if (!pubId) return loadAll();
    var next = loadAll().filter(function (x) {
      return x.id !== pubId;
    });
    saveAll(next);
    persistRemoteDelete(pubId);
    return next;
  }

  function setRemoteEntries(entries) {
    remoteEntries = Array.isArray(entries) ? entries : null;
  }

  function normalizeSongToken(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2013\u2014\u2212]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function titleMatchesQuery(normQuery, postTitle) {
    var t = normalizeSongToken(postTitle);
    if (!normQuery || !t) return false;
    if (t === normQuery) return true;
    if (normQuery.length >= 3 && t.indexOf(normQuery) !== -1) return true;
    if (t.length >= 3 && normQuery.indexOf(t) !== -1) return true;
    return false;
  }

  function artistMatchesQuery(normArtist, postArtist) {
    var a = normalizeSongToken(postArtist);
    if (!normArtist) return true;
    if (!a) return false;
    if (a === normArtist) return true;
    if (normArtist.length >= 2 && (a.indexOf(normArtist) !== -1 || normArtist.indexOf(a) !== -1)) {
      return true;
    }
    return false;
  }

  /**
   * Match community posts: track title, album title (multi-track releases), and artist / album artist.
   * Artist filter is ignored when empty.
   */
  function postMatchesSongSearch(tq, aq, p) {
    var trackTitle = p.title || "";
    var albumTitle = p.albumTitle || "";
    var titleOk =
      titleMatchesQuery(tq, trackTitle) || (albumTitle && titleMatchesQuery(tq, albumTitle));
    if (!titleOk) return false;
    if (!aq) return true;
    var byTrack = artistMatchesQuery(aq, p.artist || "");
    var byAlbum =
      p.albumArtist && typeof p.albumArtist === "string"
        ? artistMatchesQuery(aq, p.albumArtist)
        : false;
    return byTrack || byAlbum;
  }

  function findPostsBySong(title, artist) {
    var tq = normalizeSongToken(title);
    var aq = normalizeSongToken(artist);
    if (!tq) return [];
    return loadAll().filter(function (p) {
      return postMatchesSongSearch(tq, aq, p);
    });
  }

  function displayNameMatchesQuery(normProfile, displayName) {
    var d = normalizeSongToken(displayName || "");
    if (!normProfile || !d) return false;
    if (d === normProfile) return true;
    if (
      normProfile.length >= 2 &&
      (d.indexOf(normProfile) !== -1 || normProfile.indexOf(d) !== -1)
    ) {
      return true;
    }
    return false;
  }

  /** Posts whose publisher display name matches (substring, normalized). */
  function findPostsByProfile(profileQuery) {
    var pq = normalizeSongToken(profileQuery || "");
    if (!pq) return [];
    return loadAll().filter(function (p) {
      return displayNameMatchesQuery(pq, p.displayName || "");
    });
  }

  function filterPostsByProfile(posts, profileQuery) {
    var pq = normalizeSongToken(profileQuery || "");
    if (!pq || !posts || !posts.length) return posts || [];
    return posts.filter(function (p) {
      return displayNameMatchesQuery(pq, p.displayName || "");
    });
  }

  function userProfileHref(userId, displayName) {
    var uid = String(userId || "").trim();
    if (uid) {
      return "user.html?uid=" + encodeURIComponent(uid);
    }
    var dn = String(displayName || "").trim();
    if (dn) {
      return "user.html?name=" + encodeURIComponent(dn);
    }
    return "user.html";
  }

  function listPostsByUser(userId, displayName) {
    var uid = String(userId || "").trim();
    var dn = normalizeSongToken(displayName || "");
    return loadAll()
      .filter(function (p) {
        if (!p) return false;
        var pUid = String(p.userId || "").trim();
        if (uid && pUid) return pUid === uid;
        if (uid && !pUid) return false;
        if (!dn) return false;
        return normalizeSongToken(p.displayName || "") === dn;
      })
      .sort(function (a, b) {
        var ta = a.songPublishedAt || a.createdAt || 0;
        var tb = b.songPublishedAt || b.createdAt || 0;
        return tb - ta;
      });
  }

  /** First genre board slot for a published id after merge (for deep links). */
  function resolvePostBoardLocation(pubId) {
    if (!pubId) return null;
    var genres = global.SONG_SHARE_GENRES || [];
    function findSlot(skipAllGenres) {
      for (var gi = 0; gi < genres.length; gi++) {
        if (skipAllGenres && genres[gi].name === ALL_GENRES_SLOT_NAME) continue;
        var tracks = genres[gi].tracks || [];
        for (var ti = 0; ti < tracks.length; ti++) {
          var t = tracks[ti];
          if (t && t.userPublished && t.pubId === pubId) {
            return { genreId: gi + 1, trackIdx: ti, genreName: genres[gi].name };
          }
        }
      }
      return null;
    }
    return findSlot(true) || findSlot(false);
  }

  function applyMerge() {
    if (!global.SONG_SHARE_GENRES || !global.SONG_SHARE_GENRES.length) return;
    global.SONG_SHARE_GENRES = mergeGenres(global.SONG_SHARE_GENRES);
  }

  global.SongSharePublished = {
    ALL_GENRES_SLOT_NAME: ALL_GENRES_SLOT_NAME,
    loadAll: loadAll,
    add: add,
    upsert: upsert,
    removeById: removeById,
    setRemoteEntries: setRemoteEntries,
    mergeGenres: mergeGenres,
    applyMerge: applyMerge,
    findPostsBySong: findPostsBySong,
    findPostsByProfile: findPostsByProfile,
    filterPostsByProfile: filterPostsByProfile,
    userProfileHref: userProfileHref,
    listPostsByUser: listPostsByUser,
    resolvePostBoardLocation: resolvePostBoardLocation,
  };

  applyMerge();
})(window);
