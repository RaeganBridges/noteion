/**
 * Profile — desk rail + publish (lyrics, highlights, publisher annotation slips, meaning).
 */
(function ($) {
  "use strict";

  var editingPubId = null;
  var editingAlbumPubId = null;
  var albumState = { activeIdx: 0, tracks: [] };
  var MAX_ALBUM_AUDIO_BYTES = 140000;
  var MAX_ALBUM_COVER_BYTES = 220000;
  var MAX_SONG_COVER_DATA_URL_CHARS = 280000;
  var MAX_EMBEDDED_RASTER_BYTES = 450000;
  var MAX_AUDIO_BYTES_FOR_COVER_PARSE = 12000000;
  var albumCoverDataUrl = "";
  var composerHlSeqRef = { n: 0 };
  var albumHlSeqRef = { n: 0 };

  function applyAlbumCoverFromAutoExtract(dataUrl) {
    if (!dataUrl || albumCoverDataUrl) return;
    if (dataUrl.length > MAX_SONG_COVER_DATA_URL_CHARS) return;
    albumCoverDataUrl = dataUrl;
    $("#album-cover-preview").attr("src", dataUrl).removeAttr("hidden");
    $("#album-cover-empty").attr("hidden", "");
  }

  function uint8ToBase64(u8) {
    var CHUNK = 0x8000;
    var s = "";
    for (var i = 0; i < u8.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(s);
  }

  function dataUrlFromRawImage(u8, mimeGuess) {
    if (!u8 || !u8.length || u8.length > MAX_EMBEDDED_RASTER_BYTES) return null;
    var mime = mimeGuess || "image/jpeg";
    if (u8[0] === 0xff && u8[1] === 0xd8) mime = "image/jpeg";
    else if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) mime = "image/png";
    var url = "data:" + mime + ";base64," + uint8ToBase64(u8);
    return url.length <= MAX_SONG_COVER_DATA_URL_CHARS ? url : null;
  }

  function id3Syncsafe(s0, s1, s2, s3) {
    return (((s0 & 0x7f) << 21) | ((s1 & 0x7f) << 14) | ((s2 & 0x7f) << 7) | (s3 & 0x7f)) >>> 0;
  }

  function readU32BE(u8, o) {
    if (o + 4 > u8.length) return 0;
    return ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
  }

  function parseApicFrameBody(body) {
    if (!body || body.length < 16) return null;
    var enc = body[0];
    var i = 1;
    while (i < body.length && body[i] !== 0) i++;
    if (i >= body.length) return null;
    var mime = "";
    for (var j = 1; j < i; j++) mime += String.fromCharCode(body[j]);
    i++;
    if (i >= body.length) return null;
    i++;
    if (enc === 0 || enc === 3) {
      while (i < body.length && body[i] !== 0) i++;
      i++;
    } else {
      while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2;
      i += 2;
    }
    if (i >= body.length) return null;
    var img = body.subarray(i);
    return dataUrlFromRawImage(img, (mime || "image/jpeg").trim()) || null;
  }

  function parseId3v2PicV22(body) {
    if (!body || body.length < 8) return null;
    var fmt = String.fromCharCode(body[1], body[2], body[3]);
    var mime = fmt === "PNG" ? "image/png" : "image/jpeg";
    var i = 5;
    while (i < body.length && body[i] !== 0) i++;
    i++;
    if (i >= body.length) return null;
    return dataUrlFromRawImage(body.subarray(i), mime);
  }

  function extractCoverFromMp3(u8) {
    if (u8.length < 10) return null;
    if (u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return null;
    var ver = u8[3];
    var tagFlags = u8[5];
    var tagSize = id3Syncsafe(u8[6], u8[7], u8[8], u8[9]);
    var pos = 10;
    var tagEnd = Math.min(10 + tagSize, u8.length);
    if (tagFlags & 0x40 && pos + 4 <= u8.length) {
      var extLen = readU32BE(u8, pos);
      pos += 4 + Math.min(extLen, tagEnd - pos - 4);
    }
    if (ver === 2) {
      while (pos + 6 <= tagEnd) {
        var id2 = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2]);
        var fs2 = (u8[pos + 3] << 16) | (u8[pos + 4] << 8) | u8[pos + 5];
        if (fs2 <= 0 || pos + 6 + fs2 > tagEnd) break;
        if (id2 === "PIC") {
          var p2 = parseId3v2PicV22(u8.subarray(pos + 6, pos + 6 + fs2));
          if (p2) return p2;
        }
        pos += 6 + fs2;
      }
      return null;
    }
    if (ver !== 3 && ver !== 4) return null;
    while (pos + 10 <= tagEnd) {
      var id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
      var frameSize =
        ver === 3
          ? readU32BE(u8, pos + 4)
          : id3Syncsafe(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7]);
      if (id === "\0\0\0\0" || frameSize <= 0) break;
      if (pos + 10 + frameSize > tagEnd) break;
      if (id === "APIC" && frameSize > 0) {
        var ap = parseApicFrameBody(u8.subarray(pos + 10, pos + 10 + frameSize));
        if (ap) return ap;
      }
      pos += 10 + frameSize;
    }
    return null;
  }

  function findJpegOrPngStart(u8, from, maxScan) {
    var end = Math.min(from + maxScan, u8.length);
    for (var o = from; o + 2 < end; o++) {
      if (u8[o] === 0xff && u8[o + 1] === 0xd8 && u8[o + 2] === 0xff) return o;
    }
    if (from + 4 <= u8.length && u8[from] === 0x89 && u8[from + 1] === 0x50) return from;
    return -1;
  }

  function extractCoverFromMp4ish(u8) {
    for (var o = 0; o + 16 < u8.length; o++) {
      if (u8[o + 4] !== 99 || u8[o + 5] !== 111 || u8[o + 6] !== 118 || u8[o + 7] !== 114) continue;
      var covrSize = readU32BE(u8, o);
      if (covrSize < 24 || o + covrSize > u8.length) continue;
      var p = o + 8;
      var boxEnd = o + covrSize;
      while (p + 8 <= boxEnd) {
        var boxSize = readU32BE(u8, p);
        var typ = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
        if (boxSize < 8 || p + boxSize > boxEnd) break;
        if (typ === "data" && boxSize > 16) {
          var inner = u8.subarray(p + 8, p + boxSize);
          var imgStart = findJpegOrPngStart(inner, 0, Math.min(inner.length, 64));
          if (imgStart < 0) imgStart = findJpegOrPngStart(inner, 8, inner.length - 8);
          if (imgStart < 0) imgStart = 8;
          var img = inner.subarray(imgStart);
          var guessed =
            img[0] === 0x89 && img[1] === 0x50 ? "image/png" : "image/jpeg";
          var pic = dataUrlFromRawImage(img, guessed);
          if (pic) return pic;
        }
        p += boxSize;
      }
    }
    return null;
  }

  function extractCoverFromAudioBytes(u8, fileName) {
    var lower = String(fileName || "").toLowerCase();
    var tryMp3 =
      /\.(mp3|mpeg)$/i.test(lower) ||
      (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33);
    var tryM4a = /\.(m4a|mp4|aac)$/i.test(lower);
    if (tryMp3) {
      var c = extractCoverFromMp3(u8);
      if (c) return c;
    }
    if (tryM4a) {
      c = extractCoverFromMp4ish(u8);
      if (c) return c;
    }
    return extractCoverFromMp3(u8) || extractCoverFromMp4ish(u8);
  }

  function normMatchToken(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function fetchItunesCoverDataUrl(artist, title) {
    var q = (String(artist || "").trim() + " " + String(title || "").trim()).trim();
    if (!q) return Promise.resolve(null);
    return fetch(
      "https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&entity=song&limit=12"
    )
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        var results = (data && data.results) || [];
        if (!results.length) return null;
        var nt = normMatchToken(title);
        var na = normMatchToken(artist);
        var best = null;
        for (var i = 0; i < results.length; i++) {
          var row = results[i];
          if (!row || !row.trackName || !row.artworkUrl100) continue;
          var rt = normMatchToken(row.trackName);
          var ra = normMatchToken(row.artistName || "");
          var titleOk =
            !nt || rt.indexOf(nt) !== -1 || nt.indexOf(rt) !== -1 || rt === nt;
          var artistOk =
            !na || ra.indexOf(na) !== -1 || na.indexOf(ra) !== -1 || ra === na;
          if (titleOk && artistOk) {
            best = row;
            break;
          }
        }
        if (!best) best = results[0];
        if (!best || !best.artworkUrl100) return null;
        var imgUrl = String(best.artworkUrl100).replace(/100x100bb/, "600x600bb");
        return fetch(imgUrl);
      })
      .then(function (imgRes) {
        if (!imgRes || !imgRes.ok) return null;
        return imgRes.blob();
      })
      .then(function (blob) {
        if (!blob || blob.size > 900000) return null;
        return new Promise(function (resolve) {
          var fr = new FileReader();
          fr.onload = function () {
            var s = fr.result;
            if (
              typeof s === "string" &&
              s.length > 0 &&
              s.length <= MAX_SONG_COVER_DATA_URL_CHARS
            ) {
              resolve(s);
            } else {
              resolve(null);
            }
          };
          fr.onerror = function () {
            resolve(null);
          };
          fr.readAsDataURL(blob);
        });
      })
      .catch(function () {
        return null;
      });
  }

  var slipDragState = {
    active: false,
    $slip: null,
    $layer: null,
    innerEl: null,
    startClientY: 0,
    startTop: 0,
    lastClientY: 0,
  };

  var HL_COLOR_NAMES = ["amber", "mint", "rose", "sky"];

  function ensureHlSeq(ed, counterRef) {
    if (!ed) return;
    var max = 0;
    var hls = ed.querySelectorAll(".lyric-hl");
    var i;
    for (i = 0; i < hls.length; i++) {
      var s = parseInt(hls[i].getAttribute("data-noteion-hl-seq"), 10);
      if (!isNaN(s) && s > max) max = s;
    }
    var c = Math.max(counterRef.n, max);
    for (i = 0; i < hls.length; i++) {
      if (!hls[i].hasAttribute("data-noteion-hl-seq")) {
        c += 1;
        hls[i].setAttribute("data-noteion-hl-seq", String(c));
      }
    }
    counterRef.n = c;
  }

  function syncComposerHlSeqFromDom() {
    var ed = document.getElementById("composer-lyrics-ed");
    ensureHlSeq(ed, composerHlSeqRef);
  }

  function syncAlbumHlSeqFromDom() {
    var ed = document.getElementById("album-lyrics-ed");
    ensureHlSeq(ed, albumHlSeqRef);
  }

  function getHlIndexForMostRecentHighlight(ed) {
    if (!ed) return -1;
    var hls = ed.querySelectorAll(".lyric-hl");
    if (!hls.length) return -1;
    var bestI = 0;
    var bestSeq = -Infinity;
    for (var i = 0; i < hls.length; i++) {
      var seq = parseInt(hls[i].getAttribute("data-noteion-hl-seq"), 10);
      if (isNaN(seq)) seq = i;
      if (seq >= bestSeq) {
        bestSeq = seq;
        bestI = i;
      }
    }
    return bestI;
  }

  function hlColorKeyFromElement(hl) {
    if (!hl || !hl.className) return "";
    var cls = hl.className;
    if (/lyric-hl--amber/.test(cls)) return "amber";
    if (/lyric-hl--mint/.test(cls)) return "mint";
    if (/lyric-hl--rose/.test(cls)) return "rose";
    if (/lyric-hl--sky/.test(cls)) return "sky";
    return "";
  }

  function applySlipColorClass($slip, key) {
    var $s = $slip;
    HL_COLOR_NAMES.forEach(function (k) {
      $s.removeClass("composer-slip--" + k);
    });
    if (key && HL_COLOR_NAMES.indexOf(key) !== -1) {
      $s.addClass("composer-slip--" + key);
      $s.attr("data-slip-color", key);
    } else {
      $s.removeAttr("data-slip-color");
    }
  }

  function slipTopOverridePx($slip) {
    var v = $slip.attr("data-top-override");
    if (v == null || v === "") return null;
    var t = parseFloat(v, 10);
    return isNaN(t) ? null : t;
  }

  function setSlipTopOverride($slip, px) {
    if (px == null || isNaN(px)) {
      $slip.removeAttr("data-top-override");
      return;
    }
    $slip.attr("data-top-override", String(Math.round(px)));
  }

  function clampSlipCenterTop($slip, $layer, innerEl, topPx) {
    if (!innerEl || !$layer.length) return topPx;
    var lh = $layer.height();
    if (!lh) {
      var br = innerEl.getBoundingClientRect();
      lh = br.height;
    }
    var h = $slip.outerHeight() || 40;
    var half = h / 2;
    var min = half;
    var max = lh - half;
    if (max < min) max = min;
    return Math.min(max, Math.max(min, topPx));
  }

  function newAlbumTrack() {
    return {
      pubId: "tr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      title: "",
      artist: "",
      lyricsHtml: "",
      meaningText: "",
      genreTags: [],
      stickyNotes: [],
      songPublishedAt: null,
      meaningPublishedAt: null,
      audioName: "",
      audioDataUrl: "",
    };
  }

  function getAlbumLyricsHtml() {
    var el = document.getElementById("album-lyrics-ed");
    return el ? el.innerHTML.trim() : "";
  }

  function setAlbumLyricsHtml(html) {
    var el = document.getElementById("album-lyrics-ed");
    if (el) el.innerHTML = html || "";
    albumHlSeqRef.n = 0;
    syncAlbumHlSeqFromDom();
  }

  function setAlbumLyricsStatus(msg) {
    $(".js-album-lyrics-status").text(msg || "");
  }

  function hideAlbumLyricsPicks() {
    $(".js-album-lyrics-picks-wrap").attr("hidden", "").find(".js-album-lyrics-picks").empty();
  }

  function commitAlbumTrackFromForm() {
    var idx = albumState.activeIdx;
    var tr = albumState.tracks[idx];
    if (!tr) return;
    tr.title = String($("#album-track-title").val() || "").trim();
    tr.artist = String($("#album-track-artist").val() || "").trim();
    tr.meaningText = String($("#album-meaning").val() || "").trim();
    tr.lyricsHtml = getAlbumLyricsHtml();
    tr.stickyNotes = collectAlbumStickies();
    var tags = [];
    $(".js-album-genre-tags .js-album-genre-tag-input:checked").each(function () {
      tags.push(String($(this).val()));
    });
    tr.genreTags = tags;
    renderAlbumTrackList();
  }

  function fillAlbumFormFromTrack(idx) {
    var tr = albumState.tracks[idx];
    if (!tr) return;
    $("#album-track-title").val(tr.title || "");
    $("#album-track-artist").val(tr.artist || "");
    $("#album-meaning").val(tr.meaningText || "");
    setAlbumLyricsHtml(tr.lyricsHtml || "");
    $(".js-album-genre-tags .js-album-genre-tag-input").each(function () {
      var v = String($(this).val());
      $(this).prop("checked", (tr.genreTags || []).indexOf(v) !== -1);
    });
    renderAlbumStickies(tr.stickyNotes || []);
    setAlbumLyricsStatus("");
    hideAlbumLyricsPicks();
  }

  function switchAlbumTrack(nextIdx) {
    if (nextIdx < 0 || nextIdx >= albumState.tracks.length) return;
    commitAlbumTrackFromForm();
    albumState.activeIdx = nextIdx;
    renderAlbumTrackList();
    fillAlbumFormFromTrack(nextIdx);
    scheduleAlbumSlipRelayout();
  }

  function renderAlbumTrackList() {
    var $ul = $(".js-album-track-list").empty();
    albumState.tracks.forEach(function (tr, i) {
      var label = tr.title || "Untitled track";
      var $btn = $(
        '<li><button type="button" class="album-track-item" data-track-idx="' +
          i +
          '"><span class="album-track-item-index">Track ' +
          (i + 1) +
          "</span>" +
          escapeHtml(label) +
          "</button></li>"
      );
      if (i === albumState.activeIdx) {
        $btn.find(".album-track-item").addClass("is-active");
      }
      $ul.append($btn);
    });
    var n = albumState.tracks.length;
    $(".js-album-remove-track").prop("disabled", n <= 1).attr("aria-disabled", n <= 1 ? "true" : "false");
  }

  function genresSelectableForPosts() {
    var genres = window.SONG_SHARE_GENRES || [];
    var skip =
      window.SongSharePublished && window.SongSharePublished.ALL_GENRES_SLOT_NAME
        ? window.SongSharePublished.ALL_GENRES_SLOT_NAME
        : "All genres";
    return genres.filter(function (g) {
      return g && g.name !== skip;
    });
  }

  function buildAlbumGenreTags() {
    var $wrap = $(".js-album-genre-tags");
    $wrap.empty();
    var genres = genresSelectableForPosts();
    genres.forEach(function (g, i) {
      var id = "album-genre-tag-" + i;
      var $lab = $('<label class="composer-genre-tag" />').attr("for", id);
      $lab.append(
        $('<input type="checkbox" class="js-album-genre-tag-input" />')
          .attr("value", g.name)
          .attr("id", id)
      );
      $lab.append($("<span/>").text(g.name));
      $wrap.append($lab);
    });
  }

  function collectAlbumStickies() {
    var out = [];
    $(".js-album-sticky-layer .composer-slip").each(function () {
      var $s = $(this);
      var text = slipNoteText($s);
      if ($s.hasClass("composer-slip--legacy")) {
        var st = this.style;
        out.push({
          left: parseFloat(st.left) || 0,
          top: parseFloat(st.top) || 0,
          text: text,
        });
        return;
      }
      var idx = parseInt($s.attr("data-hl-idx"), 10);
      if (isNaN(idx)) idx = out.length;
      var topPx = slipTopOverridePx($s);
      var sc = $s.attr("data-slip-color");
      var row = {
        highlightIndex: idx,
        side: "r",
        text: text,
        left: 0,
        top: 0,
      };
      if (topPx != null) row.topPx = topPx;
      if (sc && HL_COLOR_NAMES.indexOf(sc) !== -1) row.slipColor = sc;
      out.push(row);
    });
    return out;
  }

  function positionAlbumSlip($slip, hlIndex) {
    var override = slipTopOverridePx($slip);
    if (override != null) {
      $slip.css("top", Math.round(override) + "px");
      return;
    }
    var inner = document.querySelector(".js-album-lyrics-inner");
    var ed = document.getElementById("album-lyrics-ed");
    if (!inner || !ed) return;
    var hls = ed.querySelectorAll(".lyric-hl");
    var hl = hls[hlIndex];
    if (!hl) return;
    var br = inner.getBoundingClientRect();
    var hr = hl.getBoundingClientRect();
    var centerY = hr.top - br.top + hr.height / 2;
    $slip.css("top", Math.round(centerY) + "px");
  }

  function relayoutAlbumSlips() {
    $(".js-album-sticky-layer .composer-slip").each(function () {
      var $s = $(this);
      if ($s.hasClass("composer-slip--legacy")) return;
      var idx = parseInt($s.attr("data-hl-idx"), 10);
      if (isNaN(idx)) return;
      positionAlbumSlip($s, idx);
    });
  }

  function renderAlbumStickies(notes) {
    var $layer = $(".js-album-sticky-layer").empty();
    if (!notes || !notes.length) {
      $layer.attr("aria-hidden", "true");
      return;
    }
    $layer.removeAttr("aria-hidden");
    notes.forEach(function (n, orderIdx) {
      if (!n || typeof n !== "object") return;
      var hasHlIdx = typeof n.highlightIndex === "number" && !isNaN(n.highlightIndex);
      var hlIdx = hasHlIdx ? n.highlightIndex : orderIdx;

      var legacy =
        !hasHlIdx &&
        (n.left != null || n.top != null) &&
        (typeof n.left === "number" || typeof n.left === "string" || typeof n.top === "number" || typeof n.top === "string");

      var $slip;
      if (legacy) {
        $slip = $('<div class="composer-slip" contenteditable="true" spellcheck="true" />').text(
          n.text != null ? String(n.text) : ""
        );
        var left = typeof n.left === "number" ? n.left : parseFloat(n.left);
        var top = typeof n.top === "number" ? n.top : parseFloat(n.top);
        if (isNaN(left)) left = 15;
        if (isNaN(top)) top = 18;
        $slip.addClass("composer-slip--legacy").css({ left: left + "%", top: top + "%" });
      } else {
        $slip = buildMarginSlip(hlIdx, n.text != null ? String(n.text) : "", n.slipColor || "");
        if (typeof n.topPx === "number" && !isNaN(n.topPx)) {
          $slip.attr("data-top-override", String(n.topPx));
        }
      }
      $layer.append($slip);
    });
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(relayoutAlbumSlips);
    });
  }

  function wrapAlbumHl(classSuffix) {
    var el = document.getElementById("album-lyrics-ed");
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
    albumHlSeqRef.n += 1;
    span.setAttribute("data-noteion-hl-seq", String(albumHlSeqRef.n));
    sel.removeAllRanges();
  }

  function clearAlbumHighlights() {
    $("#album-lyrics-ed .lyric-hl").each(function () {
      $(this).replaceWith($(this).contents());
    });
    $(".js-album-sticky-layer .composer-slip").not(".composer-slip--legacy").remove();
    if (!$(".js-album-sticky-layer .composer-slip").length) {
      $(".js-album-sticky-layer").attr("aria-hidden", "true");
    }
  }

  var albumSlipLayoutTimer = null;
  function scheduleAlbumSlipRelayout() {
    if ($("#profile-album-composer").is(":hidden")) return;
    if (albumSlipLayoutTimer) window.clearTimeout(albumSlipLayoutTimer);
    albumSlipLayoutTimer = window.setTimeout(function () {
      albumSlipLayoutTimer = null;
      relayoutAlbumSlips();
    }, 100);
  }

  function resetAlbumComposer() {
    editingAlbumPubId = null;
    albumState = { activeIdx: 0, tracks: [newAlbumTrack()] };
    $("#album-dialog-title").text("Publish an album");
    $(".js-album-publish-desk").text("Publish album to desk");
    $("#album-album-title").val("");
    $("#album-album-artist").val("");
    $("#album-track-title").val("");
    $("#album-track-artist").val("");
    $("#album-meaning").val("");
    setAlbumLyricsHtml("");
    renderAlbumStickies([]);
    buildAlbumGenreTags();
    renderAlbumTrackList();
    fillAlbumFormFromTrack(0);
    setAlbumLyricsStatus("");
    hideAlbumLyricsPicks();
    $(".js-album-delete-post").prop("hidden", true);
    albumCoverDataUrl = "";
    $("#album-cover-preview").attr("hidden", "").removeAttr("src");
    $("#album-cover-empty").removeAttr("hidden");
    $(".js-album-cover-file").val("");
  }

  function openAlbumComposer() {
    $("#profile-composer").attr("hidden", "").attr("aria-hidden", "true");
    var $c = $("#profile-album-composer");
    $c.removeAttr("hidden").attr("aria-hidden", "false");
    $("body").addClass("composer-open");
    window.setTimeout(function () {
      $("#album-album-title").trigger("focus");
    }, 50);
  }

  function closeAlbumComposer() {
    $("#profile-album-composer").attr("hidden", "").attr("aria-hidden", "true");
    $("body").removeClass("composer-open");
  }

  function openAlbumComposerForEdit(item) {
    var session = window.SongShareAuth.getSession();
    if (!session || !item || item.kind !== "album") return;
    closeComposer();
    resetComposer();
    editingPubId = null;
    editingAlbumPubId = item.pubId;
    albumState = {
      activeIdx: 0,
      tracks: (item.tracks || []).map(function (t) {
        var o = Object.assign({}, t);
        if (!o.pubId) o.pubId = "tr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        return o;
      }),
    };
    if (!albumState.tracks.length) {
      albumState.tracks = [newAlbumTrack()];
    }
    $("#album-dialog-title").text("Edit album");
    $(".js-album-publish-desk").text("Save album");
    $("#album-album-title").val(item.albumTitle || "");
    $("#album-album-artist").val(item.albumArtist || "");
    albumCoverDataUrl = item.albumCoverDataUrl || "";
    if (albumCoverDataUrl) {
      $("#album-cover-preview").attr("src", albumCoverDataUrl).removeAttr("hidden");
      $("#album-cover-empty").attr("hidden", "");
    } else {
      $("#album-cover-preview").attr("hidden", "").removeAttr("src");
      $("#album-cover-empty").removeAttr("hidden");
    }
    $(".js-album-cover-file").val("");
    buildAlbumGenreTags();
    renderAlbumTrackList();
    fillAlbumFormFromTrack(0);
    setAlbumLyricsStatus("");
    hideAlbumLyricsPicks();
    $(".js-album-delete-post").prop("hidden", false);
    openAlbumComposer();
  }

  function publishAlbum() {
    var session = window.SongShareAuth.getSession();
    if (!session) return;
    commitAlbumTrackFromForm();

    var albumTitle = String($("#album-album-title").val() || "").trim();
    var albumArtist = String($("#album-album-artist").val() || "").trim();
    if (!albumTitle) {
      window.alert("Add an album title before publishing.");
      return;
    }
    if (!albumState.tracks.length) {
      window.alert("Add at least one track.");
      return;
    }

    var displayName = session.displayName || session.email || "Member";
    var now = Date.now();
    var albumPubId =
      editingAlbumPubId || "alb_" + now + "_" + Math.random().toString(36).slice(2, 9);

    if (editingAlbumPubId) {
      var prevAlbum = window.SongShareUploads.list(session.userId).find(function (x) {
        return x.pubId === albumPubId;
      });
      if (prevAlbum && prevAlbum.kind === "album" && Array.isArray(prevAlbum.tracks)) {
        var keep = {};
        albumState.tracks.forEach(function (t) {
          if (t && t.pubId) keep[t.pubId] = true;
        });
        prevAlbum.tracks.forEach(function (t) {
          if (t && t.pubId && !keep[t.pubId]) {
            window.SongSharePublished.removeById(t.pubId);
          }
        });
      }
    }

    for (var i = 0; i < albumState.tracks.length; i++) {
      var tr = albumState.tracks[i];
      var lyricsPlain = "";
      var tmp = document.createElement("div");
      tmp.innerHTML = tr.lyricsHtml || "";
      lyricsPlain = (tmp.textContent || "").trim();
      if (!String(tr.title || "").trim()) {
        window.alert("Track " + (i + 1) + " needs a title.");
        return;
      }
      if (!lyricsPlain) {
        window.alert("Track " + (i + 1) + " needs lyrics.");
        return;
      }
      if (!String(tr.meaningText || "").trim()) {
        window.alert("Track " + (i + 1) + " needs a meaning.");
        return;
      }
      if (!(tr.genreTags && tr.genreTags.length)) {
        window.alert("Track " + (i + 1) + " needs at least one genre tag.");
        return;
      }
    }

    var coverPersist = albumCoverDataUrl || "";
    if (coverPersist.length > MAX_SONG_COVER_DATA_URL_CHARS) {
      coverPersist = "";
    }

    albumState.tracks.forEach(function (tr, i) {
      var existing = window.SongSharePublished.loadAll().find(function (p) {
        return p.id === tr.pubId;
      });
      var songPublishedAt = existing && existing.songPublishedAt ? existing.songPublishedAt : now;
      var meaningPublishedAt = existing && existing.meaningPublishedAt ? existing.meaningPublishedAt : now;
      var trackArtist = String(tr.artist || "").trim() || albumArtist;
      var entry = {
        id: tr.pubId,
        userId: session.userId,
        displayName: displayName,
        title: tr.title,
        artist: trackArtist,
        lyricsHtml: tr.lyricsHtml || "",
        meaningText: tr.meaningText || "",
        meaningAuthor: displayName,
        meaningPublishedAt: meaningPublishedAt,
        songPublishedAt: songPublishedAt,
        genreTags: tr.genreTags || [],
        stickyNotes: tr.stickyNotes || [],
        albumId: albumPubId,
        albumTitle: albumTitle,
        albumArtist: albumArtist,
        albumTrackIndex: i,
        albumCoverDataUrl: coverPersist,
      };
      window.SongSharePublished.upsert(entry);
    });

    var albumEntry = {
      kind: "album",
      pubId: albumPubId,
      albumTitle: albumTitle,
      albumArtist: albumArtist,
      albumCoverDataUrl: coverPersist,
      tracks: albumState.tracks.map(function (t) {
        var o = Object.assign({}, t);
        delete o.audioDataUrl;
        return o;
      }),
      createdAt: editingAlbumPubId
        ? (function () {
            var prev = window.SongShareUploads.list(session.userId).find(function (x) {
              return x.pubId === albumPubId;
            });
            return prev && prev.createdAt ? prev.createdAt : now;
          })()
        : now,
    };

    try {
      window.SongShareUploads.add(session.userId, albumEntry);
    } catch (err) {
      window.alert(
        "Could not save the album to your device (storage may be full). Try removing large audio uploads or older posts, then publish again."
      );
      return;
    }
    window.SongSharePublished.applyMerge();

    editingAlbumPubId = null;
    resetAlbumComposer();
    closeAlbumComposer();
    render();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function plainLyricsToEdHtml(text) {
    var raw = String(text || "").trim();
    if (window.SongShareLyrics && window.SongShareLyrics.normalizeLyricsPlainText) {
      raw = window.SongShareLyrics.normalizeLyricsPlainText(raw);
    }
    var stanzas = raw.split(/\n\n+/);
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
    d.querySelectorAll("br").forEach(function (br) {
      br.replaceWith("\n");
    });
    var paras = d.querySelectorAll("p");
    var text;
    if (paras.length) {
      text = Array.prototype.slice
        .call(paras)
        .map(function (p) {
          return (p.textContent || "").trim();
        })
        .filter(Boolean)
        .join("\n\n");
    } else {
      text = (d.textContent || "").trim();
    }
    if (window.SongShareLyrics && window.SongShareLyrics.normalizeLyricsPlainText) {
      text = window.SongShareLyrics.normalizeLyricsPlainText(text);
    }
    if (!text) return "";
    var stanzas = text.split(/\n\n+/);
    return stanzas
      .map(function (stanza) {
        var t = stanza.trim();
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
    composerHlSeqRef.n = 0;
    syncComposerHlSeqFromDom();
  }

  function setLyricsStatus(msg) {
    $(".js-lyrics-status").text(msg || "");
  }

  function hideLyricsPicks() {
    $(".js-lyrics-picks-wrap").attr("hidden", "").find(".js-lyrics-picks").empty();
  }

  /** Margin slip on the right; paired to .lyric-hl by index. */
  function buildMarginSlip(hlIdx, noteText, colorKey) {
    var $slip = $("<div/>")
      .addClass("composer-slip composer-slip--right")
      .attr("data-hl-idx", String(hlIdx))
      .attr("data-side", "r");
    applySlipColorClass($slip, colorKey || "");
    var $drag = $("<button/>", {
      type: "button",
      class: "composer-slip-drag",
      "aria-label": "Drag to move note vertically",
      title: "Drag to move",
    });
    $drag.text("⋮");
    var $remove = $("<button/>", {
      type: "button",
      class: "composer-slip-remove",
      "aria-label": "Remove this note",
      title: "Remove note",
      text: "×",
    });
    var $top = $("<div/>", { class: "composer-slip-top" });
    $top.append($drag).append($remove);
    var $body = $("<div/>", {
      class: "composer-slip-body",
      contenteditable: "true",
      spellcheck: "true",
    });
    $body.text(noteText != null ? String(noteText) : "");
    var $sw = $("<div/>", { class: "composer-slip-swatches", "aria-label": "Note color" });
    HL_COLOR_NAMES.forEach(function (k) {
      $sw.append(
        $("<button/>", {
          type: "button",
          class: "composer-slip-swatch composer-slip-swatch--" + k,
          "data-slip-color": k,
          "aria-label": k + " note",
          title: k,
        })
      );
    });
    $slip.append($top).append($body).append($sw);
    return $slip;
  }

  function slipNoteText($slip) {
    if ($slip.hasClass("composer-slip--legacy")) {
      return $slip.text().trim();
    }
    var $b = $slip.find(".composer-slip-body");
    return ($b.length ? $b.text() : $slip.text()).trim();
  }

  function maybeAddSlipAfterNewHighlight(isAlbum) {
    var edEl = document.getElementById(isAlbum ? "album-lyrics-ed" : "composer-lyrics-ed");
    var ed = isAlbum ? "#album-lyrics-ed" : "#composer-lyrics-ed";
    var layer = isAlbum ? ".js-album-sticky-layer" : ".js-sticky-layer";
    var posFn = isAlbum ? positionAlbumSlip : positionComposerSlip;
    var nHl = $(ed + " .lyric-hl").length;
    var nSlip = $(layer + " .composer-slip").not(".composer-slip--legacy").length;
    if (nHl <= nSlip) return;
    var hlIdx = getHlIndexForMostRecentHighlight(edEl);
    if (hlIdx < 0) return;
    var hls = edEl.querySelectorAll(".lyric-hl");
    var hl = hls[hlIdx];
    var ck = hlColorKeyFromElement(hl);
    $(layer).removeAttr("aria-hidden");
    var $slip = buildMarginSlip(hlIdx, "", ck);
    $(layer).append($slip);
    window.requestAnimationFrame(function () {
      posFn($slip, hlIdx);
      $slip.find(".composer-slip-body").trigger("focus");
    });
  }

  function positionComposerSlip($slip, hlIndex) {
    var override = slipTopOverridePx($slip);
    if (override != null) {
      $slip.css("top", Math.round(override) + "px");
      return;
    }
    var inner = document.querySelector(".js-composer-lyrics-inner");
    var ed = document.getElementById("composer-lyrics-ed");
    if (!inner || !ed) return;
    var hls = ed.querySelectorAll(".lyric-hl");
    var hl = hls[hlIndex];
    if (!hl) return;
    var br = inner.getBoundingClientRect();
    var hr = hl.getBoundingClientRect();
    var centerY = hr.top - br.top + hr.height / 2;
    $slip.css("top", Math.round(centerY) + "px");
  }

  function relayoutComposerSlips() {
    $(".js-sticky-layer .composer-slip").each(function () {
      var $s = $(this);
      if ($s.hasClass("composer-slip--legacy")) return;
      var idx = parseInt($s.attr("data-hl-idx"), 10);
      if (isNaN(idx)) return;
      positionComposerSlip($s, idx);
    });
  }

  function renderComposerStickies(notes) {
    var $layer = $(".js-sticky-layer").empty();
    if (!notes || !notes.length) {
      $layer.attr("aria-hidden", "true");
      return;
    }
    $layer.removeAttr("aria-hidden");
    notes.forEach(function (n, orderIdx) {
      if (!n || typeof n !== "object") return;
      var hasHlIdx = typeof n.highlightIndex === "number" && !isNaN(n.highlightIndex);
      var hlIdx = hasHlIdx ? n.highlightIndex : orderIdx;

      var legacy =
        !hasHlIdx &&
        (n.left != null || n.top != null) &&
        (typeof n.left === "number" || typeof n.left === "string" || typeof n.top === "number" || typeof n.top === "string");

      var $slip;
      if (legacy) {
        $slip = $('<div class="composer-slip" contenteditable="true" spellcheck="true" />').text(
          n.text != null ? String(n.text) : ""
        );
        var left = typeof n.left === "number" ? n.left : parseFloat(n.left);
        var top = typeof n.top === "number" ? n.top : parseFloat(n.top);
        if (isNaN(left)) left = 15;
        if (isNaN(top)) top = 18;
        $slip.addClass("composer-slip--legacy").css({ left: left + "%", top: top + "%" });
      } else {
        $slip = buildMarginSlip(hlIdx, n.text != null ? String(n.text) : "", n.slipColor || "");
        if (typeof n.topPx === "number" && !isNaN(n.topPx)) {
          $slip.attr("data-top-override", String(n.topPx));
        }
      }
      $layer.append($slip);
    });
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(relayoutComposerSlips);
    });
  }

  function collectStickies() {
    var out = [];
    $(".js-sticky-layer .composer-slip").each(function () {
      var $s = $(this);
      var text = slipNoteText($s);
      if ($s.hasClass("composer-slip--legacy")) {
        var st = this.style;
        out.push({
          left: parseFloat(st.left) || 0,
          top: parseFloat(st.top) || 0,
          text: text,
        });
        return;
      }
      var idx = parseInt($s.attr("data-hl-idx"), 10);
      if (isNaN(idx)) idx = out.length;
      var topPx = slipTopOverridePx($s);
      var sc = $s.attr("data-slip-color");
      var row = {
        highlightIndex: idx,
        side: "r",
        text: text,
        left: 0,
        top: 0,
      };
      if (topPx != null) row.topPx = topPx;
      if (sc && HL_COLOR_NAMES.indexOf(sc) !== -1) row.slipColor = sc;
      out.push(row);
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
    composerHlSeqRef.n += 1;
    span.setAttribute("data-noteion-hl-seq", String(composerHlSeqRef.n));
    sel.removeAllRanges();
  }

  function clearComposerHighlights() {
    $("#composer-lyrics-ed .lyric-hl").each(function () {
      $(this).replaceWith($(this).contents());
    });
    $(".js-sticky-layer .composer-slip").not(".composer-slip--legacy").remove();
    if (!$(".js-sticky-layer .composer-slip").length) {
      $(".js-sticky-layer").attr("aria-hidden", "true");
    }
  }

  function buildGenreTags() {
    var $wrap = $(".js-composer-genre-tags");
    $wrap.empty();
    var genres = genresSelectableForPosts();
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
    $(".js-composer-delete-post").prop("hidden", true);
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
    closeAlbumComposer();
    resetAlbumComposer();
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
    $(".js-composer-delete-post").prop("hidden", false);
    openComposer();
  }

  function openComposer() {
    $("#profile-album-composer").attr("hidden", "").attr("aria-hidden", "true");
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
    var $profileDesk = $("#profile-desk");
    var $empty = $("#profile-empty");
    $profileDesk.empty();

    $(".js-profile-name").text(session.displayName || "there");

    if (!uploads.length) {
      $empty.removeAttr("hidden");
      return;
    }

    $empty.attr("hidden", "");

    uploads.forEach(function (item, index) {
      var $card;
      if (item.kind === "album") {
        var alTitle = item.albumTitle || "Untitled album";
        var alArtist = item.albumArtist || "";
        $card = $("<article/>", {
          class: "desk-card desk-card--album",
          role: "button",
          tabindex: 0,
          "data-pub-id": item.pubId,
          "aria-label": "Edit album: " + alTitle,
        });
        var $inner = $('<div class="desk-card-inner desk-card-inner--album">');
        var tracks = item.tracks || [];
        var n = tracks.length;
        var $albumHead = $('<header class="desk-card-head desk-card-head--album" />');
        $albumHead.append(
          $('<h3 class="desk-card-title" />').html(
            '<span class="desk-card-badge">Album</span> ' + escapeHtml(alTitle)
          )
        );
        if (alArtist) {
          $albumHead.append($('<p class="desk-card-artist" />').text(alArtist));
        }
        $albumHead.append(
          $('<p class="desk-card-album-meta" />').text(
            n + " track" + (n === 1 ? "" : "s") + " · Open to edit each song"
          )
        );
        $inner.append($albumHead);

        var $albumSongDesk = $('<div class="desk-album-song-desk" role="list" />');
        if (!tracks.length) {
          $albumSongDesk.append($('<p class="desk-album-empty" />').text("No tracks yet."));
        } else {
          tracks.forEach(function (tr) {
            var tTitle = String(tr.title || "Untitled").trim() || "Untitled";
            var tArtist = String(tr.artist || alArtist || "").trim();
            var lyricsBlock = buildDeskLyricsHtml(tr.lyricsHtml || "");
            var tags = (tr.genreTags || []).join(" · ");
            var $song = $('<article class="desk-mini-song" role="listitem" />');
            var $miniHead = $('<header class="desk-mini-song-head" />');
            $miniHead.append($("<h4/>", { class: "desk-mini-song-title", text: tTitle }));
            if (tArtist) {
              $miniHead.append($("<p/>", { class: "desk-mini-song-artist", text: tArtist }));
            }
            $song.append($miniHead);
            if (lyricsBlock) {
              $song.append($('<div class="desk-mini-song-lyrics" />').html(lyricsBlock));
            }
            if (tags) {
              $song.append($('<p class="desk-mini-song-tags" />').text(tags));
            }
            $albumSongDesk.append($song);
          });
        }
        $inner.append($albumSongDesk);
        $card.append($inner);
      } else {
        var tags = (item.genreTags || []).join(" · ");
        var lyricsBlock = buildDeskLyricsHtml(item.lyricsHtml);
        $card = $(
          '<article class="desk-card" role="button" tabindex="0" data-pub-id="' +
            escapeHtml(item.pubId) +
            '" aria-label="Edit: ' +
            escapeHtml(item.title || "song") +
            '">' +
            '<div class="desk-card-inner">' +
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
      }
      $card.css({
        zIndex: 10 + index,
        "--desk-rot": deskRot(index) + "deg",
      });
      $profileDesk.append($card);
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

    var $btn = $(".js-publish-desk");
    $btn.prop("disabled", true);
    setLyricsStatus("Looking up cover art…");

    fetchItunesCoverDataUrl(artist, title)
      .then(function (fetchedCover) {
        setLyricsStatus("");
        execPublishSong(
          session,
          title,
          artist,
          meaningText,
          lyricsHtml,
          genreTags,
          fetchedCover
        );
      })
      .catch(function () {
        setLyricsStatus("");
        execPublishSong(session, title, artist, meaningText, lyricsHtml, genreTags, null);
      })
      .finally(function () {
        $btn.prop("disabled", false);
      });
  }

  function execPublishSong(
    session,
    title,
    artist,
    meaningText,
    lyricsHtml,
    genreTags,
    fetchedCover
  ) {
    var now = Date.now();
    var pubId =
      editingPubId ||
      "pub_" + now + "_" + Math.random().toString(36).slice(2, 9);
    var displayName = session.displayName || session.email || "Member";
    var existing = editingPubId ? findUpload(session, editingPubId) : null;
    var songPublishedAt =
      existing && existing.songPublishedAt ? existing.songPublishedAt : now;
    var meaningPublishedAt =
      existing && existing.meaningPublishedAt ? existing.meaningPublishedAt : now;

    var cover = fetchedCover && String(fetchedCover).trim();
    if (cover && cover.length > MAX_SONG_COVER_DATA_URL_CHARS) cover = "";
    if (!cover && existing && existing.albumCoverDataUrl) {
      cover = String(existing.albumCoverDataUrl || "").trim();
    }

    var entry = {
      id: pubId,
      userId: session.userId,
      displayName: displayName,
      title: title,
      artist: artist,
      lyricsHtml: lyricsHtml,
      meaningText: meaningText,
      meaningAuthor: displayName,
      meaningPublishedAt: meaningPublishedAt,
      songPublishedAt: songPublishedAt,
      genreTags: genreTags,
      stickyNotes: collectStickies(),
      albumCoverDataUrl: cover || "",
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
      closeAlbumComposer();
      resetAlbumComposer();
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
      scheduleComposerSlipRelayout();
      maybeAddSlipAfterNewHighlight(false);
    });

    $(".js-hl-clear").on("click", function () {
      clearComposerHighlights();
      scheduleComposerSlipRelayout();
    });

    $(".js-add-slip").on("click", function () {
      var ed = document.getElementById("composer-lyrics-ed");
      var $hls = $("#composer-lyrics-ed .lyric-hl");
      if (!$hls.length) {
        window.alert("Highlight at least one line in the lyrics first. The slip is placed beside the line you highlighted most recently.");
        return;
      }
      var hlIdx = getHlIndexForMostRecentHighlight(ed);
      if (hlIdx < 0) return;
      var hl = ed.querySelectorAll(".lyric-hl")[hlIdx];
      var ck = hlColorKeyFromElement(hl);
      $(".js-sticky-layer").removeAttr("aria-hidden");
      var $slip = buildMarginSlip(hlIdx, "", ck);
      $(".js-sticky-layer").append($slip);
      window.requestAnimationFrame(function () {
        positionComposerSlip($slip, hlIdx);
        $slip.find(".composer-slip-body").trigger("focus");
      });
    });

    $("#profile-composer").on("click", ".composer-slip-remove", function (e) {
      e.preventDefault();
      e.stopPropagation();
      $(this).closest(".composer-slip").remove();
      relayoutComposerSlips();
      if (!$(".js-sticky-layer .composer-slip").length) {
        $(".js-sticky-layer").attr("aria-hidden", "true");
      }
    });

    var composerSlipLayoutTimer = null;
    function scheduleComposerSlipRelayout() {
      if ($("#profile-composer").prop("hidden")) return;
      if (composerSlipLayoutTimer) window.clearTimeout(composerSlipLayoutTimer);
      composerSlipLayoutTimer = window.setTimeout(function () {
        composerSlipLayoutTimer = null;
        relayoutComposerSlips();
      }, 100);
    }

    $(window).on("resize", scheduleComposerSlipRelayout);
    $("#composer-lyrics-ed").on("input", scheduleComposerSlipRelayout);

    function activateDeskCard($card) {
      var sess = window.SongShareAuth.getSession();
      if (!sess) return;
      var pubId = $card.data("pub-id");
      var item = findUpload(sess, pubId);
      if (!item) return;
      if (item.kind === "album") openAlbumComposerForEdit(item);
      else openComposerForEdit(item);
    }

    $("#profile-desk").on("click", ".desk-card", function () {
      activateDeskCard($(this));
    });

    $("#profile-desk").on("keydown", ".desk-card", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activateDeskCard($(this));
    });

    $(".js-composer-delete-post").on("click", function () {
      var sess = window.SongShareAuth.getSession();
      if (!sess || !editingPubId) return;
      if (!window.confirm("Remove from your desk and unpublish from the genre board?")) return;
      window.SongShareUploads.remove(sess.userId, editingPubId);
      resetComposer();
      closeComposer();
      render();
    });

    $(".js-profile-signout").on("click", function () {
      var out = window.SongShareAuth.signOut();
      function goHome() {
        window.location.href = "home.html";
      }
      if (out && typeof out.then === "function") {
        out.then(goHome).catch(goHome);
      } else {
        goHome();
      }
    });

    $(document).on("keydown", function (e) {
      if (e.key === "Escape" && !$("#profile-album-composer").prop("hidden")) {
        closeAlbumComposer();
        return;
      }
      if (e.key === "Escape" && !$("#profile-composer").attr("hidden")) {
        closeComposer();
      }
    });

    $(".js-open-album-composer").on("click", function () {
      closeComposer();
      resetComposer();
      resetAlbumComposer();
      openAlbumComposer();
    });

    $(".js-album-cover-file").on("change", function () {
      var f = this.files && this.files[0];
      this.value = "";
      if (!f) return;
      if (!/^image\//.test(f.type)) {
        window.alert("Choose an image file.");
        return;
      }
      if (f.size > MAX_ALBUM_COVER_BYTES) {
        window.alert("Image is too large. Use a smaller file (about 200KB or less).");
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        albumCoverDataUrl = reader.result;
        $("#album-cover-preview").attr("src", albumCoverDataUrl).removeAttr("hidden");
        $("#album-cover-empty").attr("hidden", "");
      };
      reader.onerror = function () {
        window.alert("Could not read that image.");
      };
      reader.readAsDataURL(f);
    });

    $(".js-album-cover-clear").on("click", function () {
      albumCoverDataUrl = "";
      $("#album-cover-preview").attr("hidden", "").removeAttr("src");
      $("#album-cover-empty").removeAttr("hidden");
      $(".js-album-cover-file").val("");
    });

    $(".js-album-composer-close").on("click", function () {
      closeAlbumComposer();
    });

    $(".js-album-publish-desk").on("click", function () {
      publishAlbum();
    });

    $(".js-album-delete-post").on("click", function () {
      var sess = window.SongShareAuth.getSession();
      if (!sess || !editingAlbumPubId) return;
      if (!window.confirm("Remove this album and every track in it from your desk and the board?")) return;
      window.SongShareUploads.remove(sess.userId, editingAlbumPubId);
      editingAlbumPubId = null;
      resetAlbumComposer();
      closeAlbumComposer();
      render();
    });

    $(".js-album-track-list").on("click", ".album-track-item", function () {
      var idx = parseInt($(this).attr("data-track-idx"), 10);
      if (isNaN(idx)) return;
      switchAlbumTrack(idx);
    });

    $(".js-album-add-track").on("click", function () {
      commitAlbumTrackFromForm();
      albumState.tracks.push(newAlbumTrack());
      albumState.activeIdx = albumState.tracks.length - 1;
      renderAlbumTrackList();
      fillAlbumFormFromTrack(albumState.activeIdx);
      scheduleAlbumSlipRelayout();
    });

    $(".js-album-remove-track").on("click", function () {
      if (albumState.tracks.length <= 1) return;
      commitAlbumTrackFromForm();
      albumState.tracks.splice(albumState.activeIdx, 1);
      if (albumState.activeIdx >= albumState.tracks.length) {
        albumState.activeIdx = albumState.tracks.length - 1;
      }
      renderAlbumTrackList();
      fillAlbumFormFromTrack(albumState.activeIdx);
      scheduleAlbumSlipRelayout();
    });

    $(".js-album-audio-files").on("change", function () {
      var files = this.files;
      if (!files || !files.length) return;
      commitAlbumTrackFromForm();
      Array.from(files).forEach(function (file) {
        if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|flac|aac|webm)$/i.test(file.name)) {
          return;
        }
        var tr = newAlbumTrack();
        tr.title = file.name.replace(/\.[^/.]+$/, "");
        tr.audioName = file.name;
        albumState.tracks.push(tr);
        if (file.size <= MAX_ALBUM_AUDIO_BYTES) {
          (function (trackRef) {
            var reader = new FileReader();
            reader.onload = function () {
              trackRef.audioDataUrl = reader.result;
            };
            reader.readAsDataURL(file);
          })(tr);
        }
        if (file.size <= MAX_AUDIO_BYTES_FOR_COVER_PARSE) {
          (function (fname) {
            var r2 = new FileReader();
            r2.onload = function () {
              try {
                var u8 = new Uint8Array(r2.result);
                var cov = extractCoverFromAudioBytes(u8, fname);
                if (cov) applyAlbumCoverFromAutoExtract(cov);
              } catch (ignore) {}
            };
            r2.readAsArrayBuffer(file);
          })(file.name);
        }
      });
      albumState.activeIdx = albumState.tracks.length - 1;
      this.value = "";
      renderAlbumTrackList();
      fillAlbumFormFromTrack(albumState.activeIdx);
      scheduleAlbumSlipRelayout();
    });

    function runFetchAlbumLyrics(artist, title) {
      if (!window.SongShareLyrics) {
        setAlbumLyricsStatus("Lyrics lookup is not available.");
        return;
      }
      var $btn = $(".js-album-fetch-lyrics");
      $btn.prop("disabled", true);
      setAlbumLyricsStatus("Loading lyrics…");
      hideAlbumLyricsPicks();
      window.SongShareLyrics.getLyrics(artist, title)
        .then(function (data) {
          var raw = data && data.lyrics ? String(data.lyrics) : "";
          if (!raw.trim()) {
            setAlbumLyricsStatus("No lyrics returned for that pair.");
            return;
          }
          setAlbumLyricsHtml(plainLyricsToEdHtml(raw));
          setAlbumLyricsStatus("Lyrics loaded.");
        })
        .catch(function () {
          setAlbumLyricsStatus("Could not load lyrics. Check artist and title spelling.");
        })
        .finally(function () {
          $btn.prop("disabled", false);
        });
    }

    function runSuggestAlbum(title) {
      if (!window.SongShareLyrics) {
        setAlbumLyricsStatus("Lyrics lookup is not available.");
        return;
      }
      var $btn = $(".js-album-fetch-lyrics");
      $btn.prop("disabled", true);
      setAlbumLyricsStatus("Searching…");
      hideAlbumLyricsPicks();
      window.SongShareLyrics.suggest(title)
        .then(function (items) {
          if (!items || !items.length) {
            setAlbumLyricsStatus("No matches. Add an artist and try again.");
            return;
          }
          var $ul = $(".js-album-lyrics-picks").empty();
          var $wrap = $(".js-album-lyrics-picks-wrap").removeAttr("hidden");
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
            setAlbumLyricsStatus("No usable matches (missing artist). Type the artist name.");
            return;
          }
          setAlbumLyricsStatus("Pick a match or refine your search.");
        })
        .catch(function () {
          setAlbumLyricsStatus("Search failed.");
        })
        .finally(function () {
          $btn.prop("disabled", false);
        });
    }

    $(".js-album-fetch-lyrics").on("click", function () {
      var title = String($("#album-track-title").val() || "").trim();
      var artist = String($("#album-track-artist").val() || "").trim();
      if (!title) {
        setAlbumLyricsStatus("Add a song title first.");
        return;
      }
      if (!artist) {
        var albumA = String($("#album-album-artist").val() || "").trim();
        if (albumA) {
          $("#album-track-artist").val(albumA);
          artist = albumA;
        }
      }
      if (artist) {
        runFetchAlbumLyrics(artist, title);
      } else {
        runSuggestAlbum(title);
      }
    });

    $(".js-album-lyrics-picks").on("click", ".profile-lyrics-pick-btn", function () {
      var art = String($(this).data("artist") || "").trim();
      var tit = String($(this).data("title") || "").trim();
      $("#album-track-artist").val(art);
      $("#album-track-title").val(tit);
      hideAlbumLyricsPicks();
      runFetchAlbumLyrics(art, tit);
    });

    $(".js-album-hl").on("click", function () {
      var cls = $(this).attr("data-hl");
      if (cls) wrapAlbumHl(cls);
      scheduleAlbumSlipRelayout();
      maybeAddSlipAfterNewHighlight(true);
    });

    $(".js-album-hl-clear").on("click", function () {
      clearAlbumHighlights();
      scheduleAlbumSlipRelayout();
    });

    $(".js-album-add-slip").on("click", function () {
      var ed = document.getElementById("album-lyrics-ed");
      var $hls = $("#album-lyrics-ed .lyric-hl");
      if (!$hls.length) {
        window.alert("Highlight at least one line in the lyrics first. The slip is placed beside the line you highlighted most recently.");
        return;
      }
      var hlIdx = getHlIndexForMostRecentHighlight(ed);
      if (hlIdx < 0) return;
      var hl = ed.querySelectorAll(".lyric-hl")[hlIdx];
      var ck = hlColorKeyFromElement(hl);
      $(".js-album-sticky-layer").removeAttr("aria-hidden");
      var $slip = buildMarginSlip(hlIdx, "", ck);
      $(".js-album-sticky-layer").append($slip);
      window.requestAnimationFrame(function () {
        positionAlbumSlip($slip, hlIdx);
        $slip.find(".composer-slip-body").trigger("focus");
      });
    });

    $("#profile-album-composer").on("click", ".composer-slip-remove", function (e) {
      e.preventDefault();
      e.stopPropagation();
      $(this).closest(".composer-slip").remove();
      relayoutAlbumSlips();
      if (!$(".js-album-sticky-layer .composer-slip").length) {
        $(".js-album-sticky-layer").attr("aria-hidden", "true");
      }
    });

    $(window).on("resize", scheduleAlbumSlipRelayout);
    $("#album-lyrics-ed").on("input", scheduleAlbumSlipRelayout);

    function slipDragEnd() {
      $(document).off(".composerSlipDrag");
      slipDragState.active = false;
      slipDragState.$slip = null;
      slipDragState.$layer = null;
      slipDragState.innerEl = null;
    }

    function slipDragMove(e) {
      if (!slipDragState.active || !slipDragState.$slip) return;
      var clientY;
      if (e.type === "touchmove") {
        clientY =
          e.originalEvent.touches && e.originalEvent.touches[0]
            ? e.originalEvent.touches[0].clientY
            : slipDragState.lastClientY;
        slipDragState.lastClientY = clientY;
        e.preventDefault();
      } else {
        clientY = e.clientY;
      }
      var dy = clientY - slipDragState.startClientY;
      var next = slipDragState.startTop + dy;
      next = clampSlipCenterTop(
        slipDragState.$slip,
        slipDragState.$layer,
        slipDragState.innerEl,
        next
      );
      slipDragState.$slip.css("top", Math.round(next) + "px");
      setSlipTopOverride(slipDragState.$slip, next);
    }

    $("#profile-composer, #profile-album-composer").on("mousedown", ".composer-slip-drag", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      var $slip = $(this).closest(".composer-slip");
      var $layer = $slip.closest(".js-sticky-layer, .js-album-sticky-layer");
      var inner = $layer.closest(".js-composer-lyrics-inner, .js-album-lyrics-inner").get(0);
      if (!inner) return;
      var top = parseFloat($slip.css("top"), 10);
      if (isNaN(top)) top = 0;
      slipDragState.active = true;
      slipDragState.$slip = $slip;
      slipDragState.$layer = $layer;
      slipDragState.innerEl = inner;
      slipDragState.startClientY = e.clientY;
      slipDragState.startTop = top;
      slipDragState.lastClientY = e.clientY;
      $(document).on("mousemove.composerSlipDrag", slipDragMove);
      $(document).on("mouseup.composerSlipDrag", slipDragEnd);
    });

    $("#profile-composer, #profile-album-composer").on("touchstart", ".composer-slip-drag", function (e) {
      var t = e.originalEvent.touches && e.originalEvent.touches[0];
      if (!t) return;
      e.preventDefault();
      var $slip = $(this).closest(".composer-slip");
      var $layer = $slip.closest(".js-sticky-layer, .js-album-sticky-layer");
      var inner = $layer.closest(".js-composer-lyrics-inner, .js-album-lyrics-inner").get(0);
      if (!inner) return;
      var top = parseFloat($slip.css("top"), 10);
      if (isNaN(top)) top = 0;
      slipDragState.active = true;
      slipDragState.$slip = $slip;
      slipDragState.$layer = $layer;
      slipDragState.innerEl = inner;
      slipDragState.startClientY = t.clientY;
      slipDragState.startTop = top;
      slipDragState.lastClientY = t.clientY;
      $(document).on("touchmove.composerSlipDrag", slipDragMove);
      $(document).on("touchend.composerSlipDrag touchcancel.composerSlipDrag", slipDragEnd);
    });

    $("#profile-composer, #profile-album-composer").on("click", ".composer-slip-swatch", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var k = $(this).attr("data-slip-color");
      if (!k) return;
      applySlipColorClass($(this).closest(".composer-slip"), k);
    });

    function bootProfile() {
      var wr = window.SongShareAuth && window.SongShareAuth.whenReady;
      if (typeof wr === "function") {
        wr.call(window.SongShareAuth).then(render).catch(render);
      } else {
        render();
      }
    }

    window.addEventListener("songshare:authed", render);
    bootProfile();
  });
})(jQuery);
