(function ($) {
  "use strict";

  function qp(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
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

  function render(posts, artistHint) {
    var $name = $(".js-artist-name");
    var $meta = $(".js-artist-meta");
    var $list = $(".js-artist-posts").empty();

    var artistLabel = String(artistHint || "").trim();
    if (!artistLabel && posts.length) {
      artistLabel = String(posts[0].artist || "").trim();
    }
    if (!artistLabel) artistLabel = "Artist";

    $name.text(artistLabel);
    document.title = artistLabel + " — Artist — Cr8Dig";

    if (!posts.length) {
      $meta.text("No published songs list this name as the track artist yet.");
      return;
    }

    $meta.text(posts.length + " song" + (posts.length === 1 ? "" : "s") + " on Cr8Dig");

    posts.forEach(function (p) {
      if (!p || !p.id) return;
      var href = resolveSongHref(p.id);
      var $item = href
        ? $("<a/>", { class: "user-post", href: href, role: "listitem" })
        : $('<article class="user-post" role="listitem" aria-disabled="true"></article>');

      var title = String(p.title || "Untitled");
      var genreTags =
        window.SongSharePublished && typeof window.SongSharePublished.displayGenreTagsWithAllSlot === "function"
          ? window.SongSharePublished.displayGenreTagsWithAllSlot(p.genreTags, null)
          : Array.isArray(p.genreTags)
            ? p.genreTags.filter(Boolean)
            : [];
      var posted = fmtWhen(p.songPublishedAt || p.createdAt);
      var album = String(p.albumTitle || "").trim();
      var who = String(p.displayName || "").trim();

      $item.append($("<h3/>", { class: "user-post-title", text: title }));
      if (who) {
        $item.append($("<p/>", { class: "user-post-line", text: who }));
      }
      if (genreTags.length) {
        var $gLine = $("<p/>", { class: "user-post-line user-post-line--genre-tags" });
        genreTags.forEach(function (tag, gi) {
          if (gi) {
            $gLine.append(document.createTextNode(" · "));
          }
          var hsl =
            window.SongSharePublished && typeof window.SongSharePublished.genreBoardHslByName === "function"
              ? window.SongSharePublished.genreBoardHslByName(tag)
              : "";
          var $chip = $("<span/>", { class: "user-post-genre-chip", text: tag });
          if (hsl) {
            $chip.css("color", hsl);
          } else {
            $chip.addClass("user-post-genre-chip--fallback");
          }
          $gLine.append($chip);
        });
        $item.append($gLine);
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
      var name = String(qp("name") || qp("artist") || "").trim();
      if (!name) {
        $(".js-artist-name").text("Artist");
        $(".js-artist-meta").text("Open this page from an artist name on a song, or add ?name=… to the URL.");
        return;
      }

      var posts = [];
      if (window.SongSharePublished && typeof window.SongSharePublished.listPostsByArtist === "function") {
        posts = window.SongSharePublished.listPostsByArtist(name);
      } else if (window.SongSharePublished && typeof window.SongSharePublished.loadAll === "function") {
        var all = window.SongSharePublished.loadAll();
        var key = String(name || "")
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[\u2013\u2014\u2212]/g, "-")
          .replace(/\s+/g, " ")
          .trim();
        posts = all
          .filter(function (p) {
            if (!p) return false;
            var pa = String(p.artist || "")
              .toLowerCase()
              .normalize("NFKD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[\u2013\u2014\u2212]/g, "-")
              .replace(/\s+/g, " ")
              .trim();
            return pa === key;
          })
          .sort(function (a, b) {
            var ta = a.songPublishedAt || a.createdAt || 0;
            var tb = b.songPublishedAt || b.createdAt || 0;
            return tb - ta;
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
