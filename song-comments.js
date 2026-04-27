/**
 * Viewer comments on the song page (song.html).
 * - Published tracks (`pubId`): primary store is Supabase `community_post_comments` so
 *   comments sync to every device. Legacy copies in post payload + local cache are merged
 *   for older data and offline optimism.
 * - Demo / no Supabase: falls back to localStorage (genre+track or post-scoped cache).
 */
(function (global) {
  "use strict";

  var PREFIX = "songShareModalCommentsV1:";
  var PUB_PREFIX = "songSharePostCommentsV1:";
  var COMMENTS_TABLE = "community_post_comments";

  function storageKey(genreId, trackIdx) {
    return PREFIX + String(genreId) + ":" + String(trackIdx);
  }

  function pubStorageKey(pubId) {
    return PUB_PREFIX + String(pubId || "");
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

  function loadPubLocal(pubId) {
    if (!pubId) return [];
    try {
      var raw = localStorage.getItem(pubStorageKey(pubId));
      var arr = raw ? JSON.parse(raw) : [];
      return normalizeComments(arr);
    } catch (e) {
      return [];
    }
  }

  function savePubLocal(pubId, items) {
    if (!pubId) return;
    localStorage.setItem(pubStorageKey(pubId), JSON.stringify(normalizeComments(items)));
  }

  function mergeCommentsById(primary, secondary) {
    var out = [];
    var seen = {};
    function add(list) {
      normalizeComments(list).forEach(function (c) {
        var cid = String((c && c.id) || "");
        if (!cid || seen[cid]) return;
        seen[cid] = true;
        out.push(c);
      });
    }
    add(primary);
    add(secondary);
    return out;
  }

  function findPublishedPost(pubId) {
    var SP = global.SongSharePublished;
    if (!pubId || !SP || typeof SP.loadAll !== "function") return null;
    var want = String(pubId);
    var all = SP.loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i] && String(all[i].id) === want) return all[i];
    }
    return null;
  }

  function supabaseClient() {
    var sb = global.songShareSupabaseClient;
    if (sb && typeof sb.from === "function") return sb;
    return null;
  }

  function rowToComment(row) {
    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name || "Member",
      body: row.body,
      ts: row.created_at,
    };
  }

  /** Sync merge: local scratch + embedded post.comments (no network). */
  function loadPublishedBase(pubId) {
    var post = findPublishedPost(pubId);
    var embedded = post ? normalizeComments(post.comments) : [];
    var local = loadPubLocal(pubId);
    return mergeCommentsById(local, embedded);
  }

  function loadPublishedWithRemote(pubId) {
    var base = loadPublishedBase(pubId);
    var sb = supabaseClient();
    if (!sb) {
      return Promise.resolve(base);
    }

    return sb
      .from(COMMENTS_TABLE)
      .select("id, post_id, user_id, display_name, body, created_at")
      .eq("post_id", String(pubId))
      .order("created_at", { ascending: false })
      .then(function (result) {
        var err = result.error;
        if (err) {
          if (typeof console !== "undefined" && console.warn) {
            var msg = err.message || String(err);
            console.warn("Noteion comments load:", msg);
            if (msg.indexOf(COMMENTS_TABLE) !== -1 || msg.indexOf("relation") !== -1) {
              console.warn(
                "[Noteion] Apply supabase/migrations/002_community_post_comments.sql in the SQL editor if this table is missing."
              );
            }
          }
          return base;
        }
        var rows = result.data || [];
        var fromDb = rows.map(rowToComment);
        return mergeCommentsById(fromDb, base);
      });
  }

  /**
   * @returns {Promise<Array>} Comment list (newest first where sourced from DB).
   */
  function load(genreId, trackIdx, pubId) {
    if (!pubId) {
      return Promise.resolve(loadLocal(genreId, trackIdx));
    }
    return loadPublishedWithRemote(pubId);
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

  function appendLocalOnly(_genreId, _trackIdx, item, pubId) {
    var cur = loadPublishedBase(pubId);
    var items = mergeCommentsById([item], cur);
    savePubLocal(pubId, items);
    saveShared(pubId, items);
    return Promise.resolve(items);
  }

  function append(genreId, trackIdx, item, pubId) {
    if (!pubId) {
      var loc = loadLocal(genreId, trackIdx);
      loc.unshift(item);
      saveLocal(genreId, trackIdx, loc);
      return Promise.resolve(loc);
    }

    var sb = supabaseClient();
    if (!sb) {
      return appendLocalOnly(genreId, trackIdx, item, pubId);
    }

    return loadPublishedWithRemote(pubId).then(function (cur) {
      var items = mergeCommentsById([item], cur);
      savePubLocal(pubId, items);

      return sb.auth.getSession().then(function (r) {
        var sess = r.data && r.data.session;
        if (!sess || !sess.user) {
          saveShared(pubId, items);
          return items;
        }

        return sb
          .from(COMMENTS_TABLE)
          .insert({
            id: String(item.id),
            post_id: String(pubId),
            user_id: sess.user.id,
            display_name: String(item.displayName || "Member"),
            body: String(item.body || ""),
            created_at: item.ts || new Date().toISOString(),
          })
          .then(function (ins) {
            if (ins.error && typeof console !== "undefined" && console.warn) {
              console.warn("Noteion comments insert:", ins.error.message || ins.error);
            }
            saveShared(pubId, items);
            return loadPublishedWithRemote(pubId);
          });
      });
    });
  }

  function removeById(genreId, trackIdx, commentId, pubId) {
    if (!commentId) {
      return load(genreId, trackIdx, pubId);
    }
    if (!pubId) {
      var nextLocal = loadLocal(genreId, trackIdx).filter(function (x) {
        return x.id !== commentId;
      });
      saveLocal(genreId, trackIdx, nextLocal);
      return Promise.resolve(nextLocal);
    }

    var sb = supabaseClient();
    return loadPublishedWithRemote(pubId).then(function (items) {
      var next = items.filter(function (x) {
        return String(x.id) !== String(commentId);
      });
      savePubLocal(pubId, next);

      if (!sb) {
        saveShared(pubId, next);
        return next;
      }

      return sb.auth.getSession().then(function (r) {
        var sess = r.data && r.data.session;
        if (!sess || !sess.user) {
          saveShared(pubId, next);
          return loadPublishedWithRemote(pubId);
        }
        return sb
          .from(COMMENTS_TABLE)
          .delete()
          .eq("id", String(commentId))
          .eq("user_id", sess.user.id)
          .then(function (del) {
            if (del.error && typeof console !== "undefined" && console.warn) {
              console.warn("Noteion comments delete:", del.error.message || del.error);
            }
            saveShared(pubId, next);
            return loadPublishedWithRemote(pubId);
          });
      });
    });
  }

  global.SongShareModalComments = {
    load: load,
    append: append,
    removeById: removeById,
  };
})(window);
