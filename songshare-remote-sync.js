/**
 * Pull community posts from Supabase and merge into the genre board.
 */
(function (global) {
  "use strict";

  function pullAndMerge() {
    var sb = global.songShareSupabaseClient;
    var SP = global.SongSharePublished;
    if (!sb || !SP || typeof SP.setRemoteEntries !== "function") {
      return Promise.resolve();
    }
    return sb
      .from("community_posts")
      .select("payload")
      .then(function (result) {
        var err = result.error;
        if (err) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("Noteion remote pull:", err.message || err);
          }
          return;
        }
        var rows = result.data || [];
        var entries = rows
          .map(function (r) {
            return r.payload;
          })
          .filter(function (p) {
            return p && p.id;
          });
        SP.setRemoteEntries(entries);
        SP.applyMerge();
        global.dispatchEvent(new CustomEvent("songshare:remote-posts"));
      });
  }

  var firstPullPromise = Promise.resolve();

  if (global.songShareSupabaseClient && global.SongShareAuth) {
    var authReady =
      typeof global.SongShareAuth.whenReady === "function"
        ? global.SongShareAuth.whenReady()
        : Promise.resolve();
    firstPullPromise = authReady.then(function () {
      return pullAndMerge();
    });
  }

  global.SongShareRemoteSync = {
    pull: pullAndMerge,
    whenReady: function () {
      return firstPullPromise;
    },
  };

  global.setInterval(function () {
    if (global.document && global.document.visibilityState === "visible") {
      pullAndMerge();
    }
  }, 120000);
})(window);
