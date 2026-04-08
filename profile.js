/**
 * Profile — desk rail + simple publish (title, artist, genre tags only).
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
    $(".js-genre-tag").prop("checked", false);
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

    if (!title) {
      window.alert("Add a title before publishing.");
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
      lyricsHtml: "",
      meaningText: "",
      meaningAuthor: "",
      meaningPublishedAt: null,
      songPublishedAt: songPublishedAt,
      genreTags: genreTags,
      stickyNotes: [],
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
