(function ($) {
  "use strict";

  function qp(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fmtWhen(ts) {
    if (ts == null || ts === "") return "";
    try {
      return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return "";
    }
  }

  function resolveSongHref(pubId) {
    if (!window.SongSharePublished || typeof window.SongSharePublished.resolvePostBoardLocation !== "function") {
      return "";
    }
    var loc = window.SongSharePublished.resolvePostBoardLocation(pubId);
    if (!loc) return "";
    return (
      "song.html?id=" +
      encodeURIComponent(String(loc.genreId)) +
      "&track=" +
      encodeURIComponent(String(loc.trackIdx))
    );
  }

  function render(posts, nameHint) {
    var $name = $(".js-user-name");
    var $meta = $(".js-user-meta");
    var $list = $(".js-user-posts").empty();

    var displayName = "";
    if (posts.length) {
      displayName = String(posts[0].displayName || "").trim();
    }
    if (!displayName) displayName = String(nameHint || "").trim();
    if (!displayName) displayName = "User";

    $name.text(displayName);
    document.title = displayName + " — Profile — Cr8Dig";

    if (!posts.length) {
      $meta.text("No published songs found for this user yet.");
      return;
    }

    $meta.text(posts.length + " posted song" + (posts.length === 1 ? "" : "s"));

    posts.forEach(function (p) {
      if (!p || !p.id) return;
      var href = resolveSongHref(p.id);
      var $item = href
        ? $("<a/>", { class: "user-post", href: href, role: "listitem" })
        : $('<article class="user-post" role="listitem" aria-disabled="true"></article>');

      var title = String(p.title || "Untitled");
      var artist = String(p.artist || "").trim();
      var genreTags = Array.isArray(p.genreTags) ? p.genreTags.filter(Boolean) : [];
      var posted = fmtWhen(p.songPublishedAt || p.createdAt);
      var album = String(p.albumTitle || "").trim();

      $item.append($("<h3/>", { class: "user-post-title", text: title }));
      if (artist) {
        $item.append($("<p/>", { class: "user-post-line", text: artist }));
      }
      if (genreTags.length) {
        $item.append($("<p/>", { class: "user-post-line user-post-line--accent", text: genreTags.join(" · ") }));
      }
      if (album) {
        $item.append($("<p/>", { class: "user-post-line", text: "Album: " + album }));
      }
      if (posted) {
        $item.append($("<p/>", { class: "user-post-line", text: "Published " + posted }));
      }
      if (!href) {
        $item.append(
          $('<p class="user-post-line">Visible on profile only (board location unavailable).</p>')
        );
      }
      $list.append($item);
    });
  }

  $(function () {
    function start() {
      var uid = String(qp("uid") || "").trim();
      var name = String(qp("name") || "").trim();
      if (!uid && !name) {
        $(".js-user-name").text("User");
        $(".js-user-meta").text("Open this page from a publisher name on a post.");
        return;
      }

      var posts = [];
      if (window.SongSharePublished && typeof window.SongSharePublished.listPostsByUser === "function") {
        posts = window.SongSharePublished.listPostsByUser(uid, name);
      } else if (window.SongSharePublished && typeof window.SongSharePublished.loadAll === "function") {
        var all = window.SongSharePublished.loadAll();
        var normName = normalize(name);
        posts = all.filter(function (p) {
          if (!p) return false;
          var pUid = String(p.userId || "").trim();
          if (uid && pUid) return pUid === uid;
          if (uid && !pUid) return false;
          if (!normName) return false;
          return normalize(p.displayName || "") === normName;
        });
      }
      render(posts, name);
    }

    var gateReady =
      window.SongShareAuth && typeof window.SongShareAuth.whenReady === "function"
        ? window.SongShareAuth.whenReady()
        : Promise.resolve();
    var syncReady =
      window.SongShareRemoteSync && typeof window.SongShareRemoteSync.whenReady === "function"
        ? window.SongShareRemoteSync.whenReady()
        : Promise.resolve();

    Promise.all([gateReady, syncReady]).then(start).catch(start);
  });
})(jQuery);
