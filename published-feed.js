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

  function saveAll(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
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
      for (var bi = 0; bi < userTracks.length; bi++) {
        var bc = userTracks[bi].albumCoverDataUrl;
        if (bc && String(bc).trim()) {
          boardStackCoverUrl = String(bc).trim();
          break;
        }
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
    resolvePostBoardLocation: resolvePostBoardLocation,
  };

  applyMerge();
})(window);
