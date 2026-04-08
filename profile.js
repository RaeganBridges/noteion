/**
 * Profile — desk rail + publish (lyrics, highlights, margin slips, meaning).
 */
(function ($) {
  "use strict";

  var editingPubId = null;

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function trashSvg() {
    return (
      '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function plainLyricsToEdHtml(text) {
    var stanzas = String(text || "").trim().split(/\n\n+/);
    return stanzas
      .map(function (s) {
        var t = s.trim();
        if (!t) return "";
        return "<p>" + escapeHtml(t).replace(/\n/g, "<br>") + "</p>";
      })
      .filter(Boolean)
      .join("");
  }

  function buildDeskLyricsHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "").trim();
    var text = (d.textContent || "").trim();
    if (!text) return "";
    var paras = text.split(/\n\n+/).slice(0, 5);
    return paras
      .map(function (p) {
        var t = p.trim();
        if (!t) return "";
        return '<p class="desk-card-stanza">' + escapeHtml(t).replace(/\n/g, "<br>") + "</p>";
      })
      .filter(Boolean)
      .join("");
  }

  function getComposerLyricsHtml() {
    var el = document.getElementById("composer-lyrics-ed");
    return el ? el.innerHTML.trim() : "";
  }

  function setComposerLyricsHtml(html) {
    var el = document.getElementById("composer-lyrics-ed");
    if (el) el.innerHTML = html || "";
  }

  function setLyricsStatus(msg) {
    $(".js-lyrics-status").text(msg || "");
  }

  function hideLyricsPicks() {
    $(".js-lyrics-picks-wrap").attr("hidden", "").find(".js-lyrics-picks").empty();
  }

  function renderComposerStickies(notes) {
    var $layer = $(".js-sticky-layer").empty();
    if (!notes || !notes.length) {
      $layer.attr("aria-hidden", "true");
      return;
    }
    $layer.removeAttr("aria-hidden");
    notes.forEach(function (n) {
      if (!n || typeof n !== "object") return;
      var left = typeof n.left === "number" ? n.left : parseFloat(n.left);
      var top = typeof n.top === "number" ? n.top : parseFloat(n.top);
      if (isNaN(left)) left = 15;
      if (isNaN(top)) top = 18;
      var $slip = $('<div class="composer-slip" contenteditable="true" />')
        .css({ left: left + "%", top: top + "%" })
        .text(n.text != null ? String(n.text) : "");
      $layer.append($slip);
    });
  }

  function collectStickies() {
    var out = [];
    $(".js-sticky-layer .composer-slip").each(function () {
      var st = this.style;
      out.push({
        left: parseFloat(st.left) || 0,
        top: parseFloat(st.top) || 0,
        text: $(this).text().trim(),
      });
    });
    return out;
  }

  function wrapComposerHl(classSuffix) {
    var el = document.getElementById("composer-lyrics-ed");
    if (!el) return;
    el.focus();
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    var span = document.createElement("span");
    span.className = "lyric-hl " + classSuffix;
    try {
      range.surroundContents(span);
    } catch (err) {
      var frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
  }

  function clearComposerHighlights() {
    $("#composer-lyrics-ed .lyric-hl").each(function () {
      $(this).replaceWith($(this).contents());
    });
  }

  function buildGenreTags() {
    var $wrap = $(".js-composer-genre-tags");
    $wrap.empty();
    var genres = window.SONG_SHARE_GENRES || [];
    genres.forEach(function (g, i) {
      var id = "genre-tag-" + i;
      var $lab = $('<label class="composer-genre-tag" />').attr("for", id);
      $lab.append($('<input type="checkbox" class="js-genre-tag" />').attr("value", g.name).attr("id", id));
      $lab.append($("<span/>").text(g.name));
      $wrap.append($lab);
    });
  }

  function resetComposer() {
    editingPubId = null;
    $("#composer-dialog-title").text("Publish a track");
    $(".js-publish-desk").text("Publish to desk");
    $("#composer-track-title").val("");
    $("#composer-artist").val("");
    $("#composer-meaning").val("");
    $(".js-genre-tag").prop("checked", false);
    setComposerLyricsHtml("");
    renderComposerStickies([]);
    setLyricsStatus("");
    hideLyricsPicks();
  }

  function findUpload(session, pubId) {
    if (!session || !pubId) return null;
    var list = window.SongShareUploads.list(session.userId);
    for (var i = 0; i < list.length; i++) {
      if (list[i].pubId === pubId) return list[i];
    }
    return null;
  }

  function openComposerForEdit(item) {
    var session = window.SongShareAuth.getSession();
    if (!session || !item) return;
    resetComposer();
    editingPubId = item.pubId;
    $("#composer-dialog-title").text("Edit your post");
    $(".js-publish-desk").text("Save changes");
    $("#composer-track-title").val(item.title || "");
    $("#composer-artist").val(item.artist || "");
    $("#composer-meaning").val(item.meaningText || "");
    setComposerLyricsHtml(item.lyricsHtml || "");
    renderComposerStickies(item.stickyNotes);
    $(".js-genre-tag").each(function () {
      var v = $(this).val();
      $(this).prop("checked", (item.genreTags || []).indexOf(v) !== -1);
    });
    openComposer();
  }

  function openComposer() {
    var $c = $("#profile-composer");
    $c.removeAttr("hidden").attr("aria-hidden", "false");
    $("body").addClass("composer-open");
    window.setTimeout(function () {
      $("#composer-track-title").trigger("focus");
    }, 50);
  }

  function closeComposer() {
    $("#profile-composer").attr("hidden", "").attr("aria-hidden", "true");
    $("body").removeClass("composer-open");
  }

  function deskRot(i) {
    var s = (i * 11) % 5;
    return s - 2;
  }

  function render() {
    var session = window.SongShareAuth && window.SongShareAuth.getSession();
    if (!session) return;

    var uploads = window.SongShareUploads.list(session.userId);
    var $desk = $("#profile-desk");
    var $empty = $("#profile-empty");
    $desk.empty();

    $(".js-profile-name").text(session.displayName || "there");

    if (!uploads.length) {
      $empty.removeAttr("hidden");
      return;
    }

    $empty.attr("hidden", "");

    uploads.forEach(function (item, index) {
      var tags = (item.genreTags || []).join(" · ");
      var lyricsBlock = buildDeskLyricsHtml(item.lyricsHtml);
      var $card = $(
        '<article class="desk-card" role="button" tabindex="0" data-pub-id="' +
          escapeHtml(item.pubId) +
          '" aria-label="Edit: ' +
          escapeHtml(item.title || "song") +
          '">' +
          '<div class="desk-card-inner">' +
          '<button type="button" class="desk-card-delete js-delete-upload" aria-label="Remove from desk and board">' +
          trashSvg() +
          "</button>" +
          '<header class="desk-card-head">' +
          '<h3 class="desk-card-title">' +
          escapeHtml(item.title) +
          "</h3>" +
          (item.artist ? '<p class="desk-card-artist">' + escapeHtml(item.artist) + "</p>" : "") +
          "</header>" +
          (lyricsBlock ? '<div class="desk-card-lyrics">' + lyricsBlock + "</div>" : "") +
          (tags ? '<p class="desk-card-tags">' + escapeHtml(tags) + "</p>" : "") +
          "</div></article>"
      );
      $card.css({
        zIndex: 10 + index,
        "--desk-rot": deskRot(index) + "deg",
      });
      $desk.append($card);
    });
  }

  function publish() {
    var session = window.SongShareAuth.getSession();
    if (!session) return;

    var title = String($("#composer-track-title").val() || "").trim();
    var artist = String($("#composer-artist").val() || "").trim();
    var meaningText = String($("#composer-meaning").val() || "").trim();
    var lyricsHtml = getComposerLyricsHtml();
    var lyricsPlain = String($("#composer-lyrics-ed").text() || "").trim();

    if (!title) {
      window.alert("Add a title before publishing.");
      return;
    }
    if (!lyricsPlain) {
      window.alert("Add lyrics (paste or fetch) before publishing.");
      return;
    }
    if (!meaningText) {
      window.alert("Add a short meaning before publishing.");
      return;
    }

    var genreTags = [];
    $(".js-genre-tag:checked").each(function () {
      genreTags.push(String($(this).val()));
    });
    if (!genreTags.length) {
      window.alert("Choose at least one genre tag so the track appears on the board.");
      return;
    }

    var now = Date.now();
    var pubId =
      editingPubId ||
      "pub_" + now + "_" + Math.random().toString(36).slice(2, 9);
    var displayName = session.displayName || session.email || "Member";
    var existing = editingPubId ? findUpload(session, editingPubId) : null;
    var songPublishedAt =
      existing && existing.songPublishedAt ? existing.songPublishedAt : now;

    var entry = {
      id: pubId,
      userId: session.userId,
      displayName: displayName,
      title: title,
      artist: artist,
      lyricsHtml: lyricsHtml,
      meaningText: meaningText,
      meaningAuthor: displayName,
      meaningPublishedAt: now,
      songPublishedAt: songPublishedAt,
      genreTags: genreTags,
      stickyNotes: collectStickies(),
    };

    if (editingPubId) {
      window.SongSharePublished.upsert(entry);
    } else {
      window.SongSharePublished.add(entry);
    }
    window.SongShareUploads.add(session.userId, Object.assign({ pubId: pubId }, entry));
    window.SongSharePublished.applyMerge();

    resetComposer();
    closeComposer();
    render();
  }

  function runFetchLyrics(artist, title) {
    if (!window.SongShareLyrics) {
      setLyricsStatus("Lyrics lookup is not available.");
      return;
    }
    var $btn = $(".js-fetch-lyrics");
    $btn.prop("disabled", true);
    setLyricsStatus("Loading lyrics…");
    hideLyricsPicks();
    window.SongShareLyrics.getLyrics(artist, title)
      .then(function (data) {
        var raw = data && data.lyrics ? String(data.lyrics) : "";
        if (!raw.trim()) {
          setLyricsStatus("No lyrics returned for that pair.");
          return;
        }
        setComposerLyricsHtml(plainLyricsToEdHtml(raw));
        setLyricsStatus("Lyrics loaded.");
      })
      .catch(function () {
        setLyricsStatus("Could not load lyrics. Check artist and title spelling.");
      })
      .finally(function () {
        $btn.prop("disabled", false);
      });
  }

  function runSuggest(title) {
    if (!window.SongShareLyrics) {
      setLyricsStatus("Lyrics lookup is not available.");
      return;
    }
    var $btn = $(".js-fetch-lyrics");
    $btn.prop("disabled", true);
    setLyricsStatus("Searching…");
    hideLyricsPicks();
    window.SongShareLyrics.suggest(title)
      .then(function (items) {
        if (!items || !items.length) {
          setLyricsStatus("No matches. Add an artist and try again.");
          return;
        }
        var $ul = $(".js-lyrics-picks").empty();
        var $wrap = $(".js-lyrics-picks-wrap").removeAttr("hidden");
        items.slice(0, 8).forEach(function (hit) {
          var art = hit.artist && hit.artist.name ? hit.artist.name : "";
          var tit = hit.title_short || hit.title || title;
          if (!art) return;
          var $li = $("<li/>");
          var $b = $('<button type="button" class="profile-lyrics-pick-btn" />');
          $b.text(art + " — " + tit);
          $b.data("artist", art);
          $b.data("title", tit);
          $li.append($b);
          $ul.append($li);
        });
        if (!$ul.children().length) {
          $wrap.attr("hidden", "");
          setLyricsStatus("No usable matches (missing artist). Type the artist name.");
          return;
        }
        setLyricsStatus("Pick a match or refine your search.");
      })
      .catch(function () {
        setLyricsStatus("Search failed.");
      })
      .finally(function () {
        $btn.prop("disabled", false);
      });
  }

  $(function () {
    buildGenreTags();

    $(".js-open-composer").on("click", function () {
      resetComposer();
      openComposer();
    });

    $(".js-composer-close").on("click", function () {
      closeComposer();
    });

    $(".js-publish-desk").on("click", function () {
      publish();
    });

    $(".js-fetch-lyrics").on("click", function () {
      var title = String($("#composer-track-title").val() || "").trim();
      var artist = String($("#composer-artist").val() || "").trim();
      if (!title) {
        setLyricsStatus("Add a song title first.");
        return;
      }
      if (artist) {
        runFetchLyrics(artist, title);
      } else {
        runSuggest(title);
      }
    });

    $(".js-lyrics-picks").on("click", ".profile-lyrics-pick-btn", function () {
      var art = String($(this).data("artist") || "").trim();
      var tit = String($(this).data("title") || "").trim();
      $("#composer-artist").val(art);
      $("#composer-track-title").val(tit);
      hideLyricsPicks();
      runFetchLyrics(art, tit);
    });

    $(".js-hl").on("click", function () {
      var cls = $(this).attr("data-hl");
      if (cls) wrapComposerHl(cls);
    });

    $(".js-hl-clear").on("click", function () {
      clearComposerHighlights();
    });

    $(".js-add-slip").on("click", function () {
      var left = 52 + Math.random() * 28;
      var top = 12 + Math.random() * 48;
      $(".js-sticky-layer").removeAttr("aria-hidden");
      var $slip = $('<div class="composer-slip" contenteditable="true" />')
        .css({ left: left + "%", top: top + "%" })
        .text("Margin note");
      $(".js-sticky-layer").append($slip);
      $slip.trigger("focus");
    });

    function activateDeskCard($card) {
      var sess = window.SongShareAuth.getSession();
      if (!sess) return;
      var pubId = $card.data("pub-id");
      var item = findUpload(sess, pubId);
      if (item) openComposerForEdit(item);
    }

    $("#profile-desk").on("click", ".desk-card", function (e) {
      if ($(e.target).closest(".js-delete-upload").length) return;
      activateDeskCard($(this));
    });

    $("#profile-desk").on("keydown", ".desk-card", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activateDeskCard($(this));
    });

    $("#profile-desk").on("click", ".js-delete-upload", function (e) {
      e.stopPropagation();
      var sess = window.SongShareAuth.getSession();
      if (!sess) return;
      var pubId = $(this).closest(".desk-card").data("pub-id");
      if (!pubId) return;
      if (!window.confirm("Remove from your desk and unpublish from the genre board?")) return;
      window.SongShareUploads.remove(sess.userId, pubId);
      render();
    });

    $(".js-profile-signout").on("click", function () {
      window.SongShareAuth.signOut();
      window.location.href = "home.html";
    });

    $(document).on("keydown", function (e) {
      if (e.key === "Escape" && !$("#profile-composer").attr("hidden")) {
        closeComposer();
      }
    });

    render();
    window.addEventListener("songshare:authed", render);
  });
})(jQuery);
