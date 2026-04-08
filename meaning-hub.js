(function ($) {
  "use strict";

  function qp(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function getTracks(g) {
    if (g.tracks && g.tracks.length) return g.tracks;
    if (g.songs && g.songs.length) {
      return g.songs.map(function (title) {
        return { title: title };
      });
    }
    return [{ title: "—" }];
  }

  function newId() {
    return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function posterLabel(item) {
    var name = (item.poster || "").trim();
    return name || "Guest";
  }

  function cardHtml(item) {
    var body = (item.body || "").trim();
    var mood = item.mood || null;
    var main =
      body ||
      (mood === "heart"
        ? '<em class="hub-feed-reactonly">Heart reaction</em>'
        : mood === "sad"
          ? '<em class="hub-feed-reactonly">Sad reaction</em>'
          : "—");
    return (
      '<article class="hub-feed-card" data-id="' +
      escapeHtml(item.id) +
      '">' +
      '<header class="hub-feed-card-poster">' +
      escapeHtml(posterLabel(item)) +
      "</header>" +
      '<div class="hub-feed-card-body">' +
      (body ? escapeHtml(body) : main) +
      "</div>" +
      '<footer class="hub-feed-card-meta"><time datetime="' +
      escapeHtml(String(item.ts || "")) +
      '">' +
      escapeHtml(formatTime(item.ts)) +
      "</time></footer>" +
      "</article>"
    );
  }

  function renderFeed(Thread, id, trackIdx) {
    var items = Thread.loadThread(id, trackIdx);
    var $feed = $("#hub-feed");
    $feed.empty();
    items.forEach(function (item) {
      $feed.append(cardHtml(item));
    });
  }

  $(function () {
    var Thread = window.SongShareThread;
    if (!Thread) return;

    var genres = window.SONG_SHARE_GENRES || [];
    var id = parseInt(qp("id"), 10);
    var trackIdx = parseInt(qp("track"), 10);
    if (isNaN(trackIdx)) trackIdx = 0;

    if (!genres.length || !id || id < 1 || id > genres.length) {
      window.location.replace("home.html");
      return;
    }

    var g = genres[id - 1];
    var tracks = getTracks(g);
    trackIdx = Math.max(0, Math.min(trackIdx, tracks.length - 1));
    var t = tracks[trackIdx];

    var meaning = t.meaning != null ? String(t.meaning).trim() : "";
    $(".js-meaning-body").text(meaning || "—");
    $(".js-song-title").text(t.title || "—");
    $(".js-genre-name").text(g.name);
    document.title = "Meaning · " + (t.title || "Song") + " — Song Share";

    var songUrl = "song.html?id=" + encodeURIComponent(String(id)) + "&track=" + encodeURIComponent(String(trackIdx));
    var readerUrl =
      "song-reader.html?id=" +
      encodeURIComponent(String(id)) +
      "&track=" +
      encodeURIComponent(String(trackIdx));

    $(".js-hub-back").attr("href", songUrl);
    $(".js-fab-song").attr("href", songUrl);
    $(".js-fab-reader").attr("href", readerUrl);
    $(".js-hub-reader-link").attr("href", readerUrl);

    $(".js-hub-back").on("click", function (e) {
      e.preventDefault();
      window.location.href = songUrl;
    });

    renderFeed(Thread, id, trackIdx);

    function postItem(partial) {
      var item = Object.assign(
        {
          id: newId(),
          ts: new Date().toISOString(),
        },
        partial
      );
      Thread.append(id, trackIdx, item);
      renderFeed(Thread, id, trackIdx);
      $("#hub-body").val("");
    }

    $("#hub-submit").on("click", function () {
      var body = String($("#hub-body").val() || "").trim();
      if (!body) return;
      var poster = String($("#hub-poster").val() || "").trim();
      postItem({ body: body, poster: poster, mood: null });
    });

    $(".hub-react-btn[data-mood]").on("click", function () {
      var mood = $(this).attr("data-mood");
      var poster = String($("#hub-poster").val() || "").trim();
      postItem({ body: "", poster: poster, mood: mood });
    });
  });
})(jQuery);
