/**
 * Profile — desk rail + publish (lyrics, highlights, publisher annotation slips, meaning).
 */
(function ($) {
  "use strict";

  var editingPubId = null;
  var editingAlbumPubId = null;
  var albumState = { activeIdx: 0, tracks: [] };
  var MAX_ALBUM_AUDIO_BYTES = 140000;
  var MAX_SONG_COVER_DATA_URL_CHARS = 280000;
  var MAX_EMBEDDED_RASTER_BYTES = 450000;
  var MAX_AUDIO_BYTES_FOR_COVER_PARSE = 12000000;
  var albumCoverDataUrl = "";
  var legacyCoverBackfillInFlight = false;
  var releaseDateBackfillInFlight = false;
  var composerHlSeqRef = { n: 0 };
  var albumHlSeqRef = { n: 0 };
  var PUBLISH_SOUND_SRC = "genre-clips/freesound_community-paper-01-87018.mp3";
  var paperAudioCtx = null;
  var publishSoundEl = null;
  var DELETE_SOUND_SRC = "genre-clips/oxidvideos-crumpling-paper-wrapping-478933.mp3";
  var deleteSoundEl = null;

  function getPublishSoundEl() {
    if (!publishSoundEl) {
      try {
        publishSoundEl = new Audio(PUBLISH_SOUND_SRC);
        publishSoundEl.preload = "auto";
        publishSoundEl.volume = 0.88;
      } catch (e) {
        publishSoundEl = null;
      }
    }
    return publishSoundEl;
  }

  function getDeleteSoundEl() {
    if (!deleteSoundEl) {
      try {
        deleteSoundEl = new Audio(DELETE_SOUND_SRC);
        deleteSoundEl.preload = "auto";
        deleteSoundEl.volume = 0.86;
      } catch (e) {
        deleteSoundEl = null;
      }
    }
    return deleteSoundEl;
  }

  function playDeleteActionSound() {
    var el = getDeleteSoundEl();
    if (!el || typeof el.play !== "function") return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch (e) {}
    var p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {});
    }
  }

  function getPaperAudioContext() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!paperAudioCtx) {
      try {
        paperAudioCtx = new Ctx();
      } catch (e) {
        return null;
      }
    }
    return paperAudioCtx;
  }

  function playPaperPublishSynthFallback() {
    var ctx = getPaperAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume().catch(function () {});
    }

    var dur = 0.34;
    var frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var lp = 0;
    for (var i = 0; i < frames; i++) {
      var t = i / frames;
      /* Crinkly envelope: quick attack, textured decay. */
      var env = Math.pow(1 - t, 1.25) * (0.8 + 0.2 * Math.sin(i * 0.21));
      var white = Math.random() * 2 - 1;
      lp = lp + 0.34 * (white - lp);
      data[i] = lp * env * 0.48;
    }

    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 520;
    var lpFilter = ctx.createBiquadFilter();
    lpFilter.type = "lowpass";
    lpFilter.frequency.value = 6900;
    var notch = ctx.createBiquadFilter();
    notch.type = "notch";
    notch.frequency.value = 2350;
    notch.Q.value = 1.2;
    var gain = ctx.createGain();
    var now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.34, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(hp);
    hp.connect(lpFilter);
    lpFilter.connect(notch);
    notch.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.03);
  }

  function playPaperPublishSound() {
    var el = getPublishSoundEl();
    if (el && typeof el.play === "function") {
      try {
        el.pause();
        el.currentTime = 0;
      } catch (e) {}
      var p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () {
          playPaperPublishSynthFallback();
        });
      }
      return;
    }
    playPaperPublishSynthFallback();
  }

  function legacyCoverBackfillStampKey(userId) {
    return "noteion.coverBackfill.v2." + String(userId || "");
  }

  function markLegacyCoverBackfillAttempted(userId) {
    if (!userId) return;
    try {
      localStorage.setItem(legacyCoverBackfillStampKey(userId), String(Date.now()));
    } catch (e) {}
  }

  function hasLegacyCoverBackfillAttempt(userId) {
    if (!userId) return false;
    try {
      return !!localStorage.getItem(legacyCoverBackfillStampKey(userId));
    } catch (e) {
      return false;
    }
  }

  function forceLegacyCoverBackfillForSession(session) {
    if (!session) return false;
    var dn = String(session.displayName || "").trim().toLowerCase();
    var email = String(session.email || "").trim().toLowerCase();
    var emailLocal = email.indexOf("@") !== -1 ? email.split("@")[0] : email;
    return dn === "drbridges23" || emailLocal === "drbridges23";
  }

  function releaseDateBackfillStampKey(userId) {
    return "noteion.releaseDateBackfill.v1." + String(userId || "");
  }

  function markReleaseDateBackfillAttempted(userId) {
    if (!userId) return;
    try {
      localStorage.setItem(releaseDateBackfillStampKey(userId), String(Date.now()));
    } catch (e) {}
  }

  function hasReleaseDateBackfillAttempt(userId) {
    if (!userId) return false;
    try {
      return !!localStorage.getItem(releaseDateBackfillStampKey(userId));
    } catch (e) {
      return false;
    }
  }

  function applyAlbumCoverFromAutoExtract(dataUrl) {
    if (!dataUrl || albumCoverDataUrl) return;
    if (dataUrl.length > MAX_SONG_COVER_DATA_URL_CHARS) return;
    albumCoverDataUrl = dataUrl;
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

  function normalizeStreamUrl(url) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    if (!/^https?:\/\//i.test(raw)) {
      raw = "https://" + raw.replace(/^\/+/, "");
    }
    return raw;
  }

  function parseDateInputToMs(v) {
    var s = String(v || "").trim();
    if (!s) return null;
    var ms = Date.parse(s + "T00:00:00");
    return isNaN(ms) ? null : ms;
  }

  function msToDateInputValue(ts) {
    if (ts == null || ts === "") return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function normalizeStreamLinks(links) {
    var src = links || {};
    return {
      spotify: normalizeStreamUrl(src.spotify),
      appleMusic: normalizeStreamUrl(src.appleMusic),
      youtube: normalizeStreamUrl(src.youtube),
    };
  }

  function buildAutoStreamLinks(artist, title) {
    var q = (String(artist || "").trim() + " " + String(title || "").trim()).trim();
    if (!q) return normalizeStreamLinks({});
    var enc = encodeURIComponent(q);
    return normalizeStreamLinks({
      spotify: "https://open.spotify.com/search/" + enc,
      appleMusic: "https://music.apple.com/us/search?term=" + enc,
      youtube: "https://www.youtube.com/results?search_query=" + enc,
    });
  }

  function mergeStreamLinks(autoLinks, manualLinks) {
    var auto = normalizeStreamLinks(autoLinks);
    var manual = normalizeStreamLinks(manualLinks);
    return {
      spotify: manual.spotify || auto.spotify || "",
      appleMusic: manual.appleMusic || auto.appleMusic || "",
      youtube: manual.youtube || auto.youtube || "",
    };
  }

  function readComposerStreamLinksFromForm() {
    return normalizeStreamLinks({
      spotify: $("#composer-link-spotify").val(),
      appleMusic: $("#composer-link-apple").val(),
      youtube: $("#composer-link-youtube").val(),
    });
  }

  function setComposerStreamLinksToForm(links) {
    var l = normalizeStreamLinks(links);
    $("#composer-link-spotify").val(l.spotify || "");
    $("#composer-link-apple").val(l.appleMusic || "");
    $("#composer-link-youtube").val(l.youtube || "");
  }

  function readAlbumStreamLinksFromForm() {
    return normalizeStreamLinks({
      spotify: $("#album-link-spotify").val(),
      appleMusic: $("#album-link-apple").val(),
      youtube: $("#album-link-youtube").val(),
    });
  }

  function setAlbumStreamLinksToForm(links) {
    var l = normalizeStreamLinks(links);
    $("#album-link-spotify").val(l.spotify || "");
    $("#album-link-apple").val(l.appleMusic || "");
    $("#album-link-youtube").val(l.youtube || "");
  }

  function refreshComposerLinkFieldsFromTrack(artist, title) {
    var auto = buildAutoStreamLinks(artist, title);
    var manual = readComposerStreamLinksFromForm();
    setComposerStreamLinksToForm(mergeStreamLinks(auto, manual));
  }

  function refreshAlbumLinkFieldsFromTrack(artist, title) {
    var auto = buildAutoStreamLinks(artist, title);
    var manual = readAlbumStreamLinksFromForm();
    setAlbumStreamLinksToForm(mergeStreamLinks(auto, manual));
  }

  /** Loads Apple’s 100×100 artwork URL at higher resolution and returns a data URL. */
  function artworkUrlToDataUrl(artworkUrl100) {
    if (!artworkUrl100) return Promise.resolve(null);
    var imgUrl = String(artworkUrl100).replace(/100x100bb/, "600x600bb");
    return fetch(imgUrl)
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

  function fetchItunesSongMeta(artist, title) {
    var q = (String(artist || "").trim() + " " + String(title || "").trim()).trim();
    if (!q) return Promise.resolve({ coverDataUrl: null, songPublishedAt: null });
    return fetch(
      "https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&entity=song&limit=12"
    )
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        var results = (data && data.results) || [];
        if (!results.length) return { coverDataUrl: null, songPublishedAt: null };
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
        if (!best) best = results[0] || null;
        var releaseMs = null;
        if (best && best.releaseDate) {
          var parsed = Date.parse(best.releaseDate);
          if (!isNaN(parsed)) releaseMs = parsed;
        }
        if (!best || !best.artworkUrl100) {
          return { coverDataUrl: null, songPublishedAt: releaseMs };
        }
        return artworkUrlToDataUrl(best.artworkUrl100).then(function (coverDataUrl) {
          return { coverDataUrl: coverDataUrl || null, songPublishedAt: releaseMs };
        });
      })
      .catch(function () {
        return { coverDataUrl: null, songPublishedAt: null };
      });
  }

  function fetchItunesCoverDataUrl(artist, title) {
    return fetchItunesSongMeta(artist, title).then(function (meta) {
      return meta && meta.coverDataUrl ? meta.coverDataUrl : null;
    });
  }

  function autoFillReleaseDateInput(selector, artist, title) {
    var $input = $(selector);
    if (!$input.length) return Promise.resolve(null);
    if (String($input.val() || "").trim()) return Promise.resolve(null);
    return fetchItunesSongMeta(artist, title).then(function (meta) {
      if (!meta || !meta.songPublishedAt) return null;
      $input.val(msToDateInputValue(meta.songPublishedAt));
      return meta.songPublishedAt;
    });
  }

  /** Album artwork from iTunes Search (entity=album). */
  function fetchItunesAlbumCoverDataUrl(albumArtist, albumTitle) {
    var q = (String(albumArtist || "").trim() + " " + String(albumTitle || "").trim()).trim();
    if (!q) return Promise.resolve(null);
    return fetch(
      "https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&entity=album&limit=15"
    )
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        var results = (data && data.results) || [];
        if (!results.length) return null;
        var nt = normMatchToken(albumTitle);
        var na = normMatchToken(albumArtist);
        var best = null;
        var i;
        for (i = 0; i < results.length; i++) {
          var row = results[i];
          if (!row || !row.collectionName || !row.artworkUrl100) continue;
          var ct = normMatchToken(row.collectionName);
          var ra = normMatchToken(row.artistName || "");
          var titleOk =
            !nt || ct.indexOf(nt) !== -1 || nt.indexOf(ct) !== -1 || ct === nt;
          var artistOk =
            !na || ra.indexOf(na) !== -1 || na.indexOf(ra) !== -1 || ra === na;
          if (titleOk && artistOk) {
            best = row;
            break;
          }
        }
        if (!best) {
          for (i = 0; i < results.length; i++) {
            if (results[i] && results[i].artworkUrl100) {
              best = results[i];
              break;
            }
          }
        }
        if (!best || !best.artworkUrl100) return null;
        return artworkUrlToDataUrl(best.artworkUrl100);
      })
      .catch(function () {
        return null;
      });
  }

  function backfillLegacyMissingCovers(session) {
    if (!session || !session.userId) return Promise.resolve(false);
    if (legacyCoverBackfillInFlight) return Promise.resolve(false);
    if (!window.SongShareUploads || !window.SongSharePublished) return Promise.resolve(false);

    var uploads = window.SongShareUploads.list(session.userId);
    if (!uploads || !uploads.length) return Promise.resolve(false);

    var songsMissing = uploads.filter(function (item) {
      return (
        item &&
        item.kind !== "album" &&
        !String(item.albumCoverDataUrl || "").trim() &&
        String(item.title || "").trim()
      );
    });
    var albumsMissing = uploads.filter(function (item) {
      return (
        item &&
        item.kind === "album" &&
        !String(item.albumCoverDataUrl || "").trim() &&
        String(item.albumTitle || "").trim()
      );
    });
    if (!songsMissing.length && !albumsMissing.length) return Promise.resolve(false);

    legacyCoverBackfillInFlight = true;
    var anyChanged = false;
    var makeFallback =
      window.SongSharePublished && typeof window.SongSharePublished.makeSongFallbackCoverDataUrl === "function"
        ? window.SongSharePublished.makeSongFallbackCoverDataUrl
        : function () {
            return "";
          };

    function fallbackGenreNameForItem(item) {
      if (!item || typeof item !== "object") return "Other";
      var tags = Array.isArray(item.genreTags) ? item.genreTags : [];
      var first = tags.length ? String(tags[0] || "").trim() : "";
      return first || "Other";
    }

    function updatePublishedSongCover(pubId, coverDataUrl) {
      if (!pubId || !coverDataUrl) return;
      var post = window.SongSharePublished.loadAll().find(function (p) {
        return p && p.id === pubId;
      });
      if (!post) return;
      if (String(post.albumCoverDataUrl || "").trim()) return;
      window.SongSharePublished.upsert(
        Object.assign({}, post, { albumCoverDataUrl: coverDataUrl })
      );
      anyChanged = true;
    }

    var chain = Promise.resolve();

    songsMissing.forEach(function (item) {
      chain = chain
        .then(function () {
          var artist = String(item.artist || "").trim();
          var title = String(item.title || "").trim();
          if (!title) return null;
          return fetchItunesCoverDataUrl(artist, title);
        })
        .then(function (coverDataUrl) {
          var coverUse = String(coverDataUrl || "").trim();
          if (!coverUse) {
            coverUse = makeFallback(
              { title: item.title || "Untitled", artist: item.artist || "" },
              fallbackGenreNameForItem(item),
              item.pubId || item.title || "song"
            );
          }
          if (!coverUse) return;
          var nextItem = Object.assign({}, item, { albumCoverDataUrl: coverUse });
          window.SongShareUploads.add(session.userId, nextItem);
          updatePublishedSongCover(item.pubId, coverUse);
          anyChanged = true;
        });
    });

    albumsMissing.forEach(function (item) {
      chain = chain
        .then(function () {
          var albumArtist = String(item.albumArtist || "").trim();
          var albumTitle = String(item.albumTitle || "").trim();
          return fetchItunesAlbumCoverDataUrl(albumArtist, albumTitle);
        })
        .then(function (coverDataUrl) {
          var coverUse = String(coverDataUrl || "").trim();
          if (!coverUse) {
            var firstTrack = item.tracks && item.tracks.length ? item.tracks[0] : null;
            var trackArtist = firstTrack ? String(firstTrack.artist || item.albumArtist || "").trim() : "";
            var trackTitle = firstTrack ? String(firstTrack.title || "").trim() : "";
            if (trackTitle) {
              return fetchItunesCoverDataUrl(trackArtist, trackTitle);
            }
            return null;
          }
          return coverUse;
        })
        .then(function (coverDataUrl) {
          var coverUse = String(coverDataUrl || "").trim();
          if (!coverUse) {
            var firstTrack = item.tracks && item.tracks.length ? item.tracks[0] : null;
            coverUse = makeFallback(
              {
                title:
                  (firstTrack && firstTrack.title) ||
                  item.albumTitle ||
                  "Untitled album",
                artist:
                  (firstTrack && firstTrack.artist) ||
                  item.albumArtist ||
                  "",
              },
              fallbackGenreNameForItem(firstTrack || item),
              item.pubId || item.albumTitle || "album"
            );
          }
          if (!coverUse) return;
          var nextAlbum = Object.assign({}, item, { albumCoverDataUrl: coverUse });
          window.SongShareUploads.add(session.userId, nextAlbum);
          if (Array.isArray(item.tracks)) {
            item.tracks.forEach(function (tr) {
              if (tr && tr.pubId) updatePublishedSongCover(tr.pubId, coverUse);
            });
          }
          anyChanged = true;
        });
    });

    return chain
      .then(function () {
        if (anyChanged) {
          window.SongSharePublished.applyMerge();
        }
        markLegacyCoverBackfillAttempted(session.userId);
        return anyChanged;
      })
      .catch(function () {
        markLegacyCoverBackfillAttempted(session.userId);
        return false;
      })
      .finally(function () {
        legacyCoverBackfillInFlight = false;
      });
  }

  function maybeRunLegacyCoverBackfill(session) {
    if (!session || !session.userId) return;
    var forced = forceLegacyCoverBackfillForSession(session);
    if (!forced && hasLegacyCoverBackfillAttempt(session.userId)) return;
    backfillLegacyMissingCovers(session).then(function (changed) {
      if (changed) render();
    });
  }

  function shouldBackfillReleaseDate(songPublishedAt, createdAt, force) {
    if (force) return true;
    if (!songPublishedAt) return true;
    if (!createdAt) return false;
    return Number(songPublishedAt) === Number(createdAt);
  }

  function backfillPostedReleaseDates(session, force) {
    if (!session || !session.userId) return Promise.resolve(false);
    if (releaseDateBackfillInFlight) return Promise.resolve(false);
    if (!window.SongShareUploads || !window.SongSharePublished) return Promise.resolve(false);

    var uploads = window.SongShareUploads.list(session.userId);
    if (!uploads || !uploads.length) return Promise.resolve(false);

    releaseDateBackfillInFlight = true;
    var anyChanged = false;
    var changedPublishedById = {};
    var chain = Promise.resolve();

    uploads.forEach(function (item, itemIdx) {
      if (!item || item.kind === "album") return;
      var title = String(item.title || "").trim();
      var artist = String(item.artist || "").trim();
      if (!title) return;
      if (!shouldBackfillReleaseDate(item.songPublishedAt, item.createdAt, !!force)) return;

      chain = chain.then(function () {
        return fetchItunesSongMeta(artist, title).then(function (meta) {
          if (!meta || !meta.songPublishedAt) return;
          uploads[itemIdx] = Object.assign({}, item, { songPublishedAt: meta.songPublishedAt });
          changedPublishedById[item.pubId] = meta.songPublishedAt;
          anyChanged = true;
        });
      });
    });

    uploads.forEach(function (item, itemIdx) {
      if (!item || item.kind !== "album" || !Array.isArray(item.tracks) || !item.tracks.length) return;
      var tracks = item.tracks.slice();
      var albumChanged = false;

      tracks.forEach(function (tr, trIdx) {
        var title = String((tr && tr.title) || "").trim();
        var artist = String((tr && (tr.artist || item.albumArtist)) || "").trim();
        if (!title) return;
        /* Album tracks: only backfill when the date is missing — do not compare to album createdAt. */
        if (!force && tr.songPublishedAt != null && tr.songPublishedAt !== "") return;
        if (force && !shouldBackfillReleaseDate(tr.songPublishedAt, item.createdAt, true)) return;

        chain = chain.then(function () {
          return fetchItunesSongMeta(artist, title).then(function (meta) {
            if (!meta || !meta.songPublishedAt) return;
            tracks[trIdx] = Object.assign({}, tr, { songPublishedAt: meta.songPublishedAt });
            if (tr && tr.pubId) changedPublishedById[tr.pubId] = meta.songPublishedAt;
            albumChanged = true;
            anyChanged = true;
          });
        });
      });

      chain = chain.then(function () {
        if (!albumChanged) return;
        uploads[itemIdx] = Object.assign({}, item, { tracks: tracks });
      });
    });

    return chain
      .then(function () {
        if (!anyChanged) {
          markReleaseDateBackfillAttempted(session.userId);
          return false;
        }

        for (var i = uploads.length - 1; i >= 0; i--) {
          window.SongShareUploads.add(session.userId, uploads[i]);
        }

        var allPosts = window.SongSharePublished.loadAll();
        Object.keys(changedPublishedById).forEach(function (pubId) {
          var post = allPosts.find(function (p) {
            return p && p.id === pubId;
          });
          if (!post) return;
          window.SongSharePublished.upsert(
            Object.assign({}, post, {
              songPublishedAt: changedPublishedById[pubId],
            })
          );
        });

        window.SongSharePublished.applyMerge();
        markReleaseDateBackfillAttempted(session.userId);
        return true;
      })
      .catch(function () {
        markReleaseDateBackfillAttempted(session.userId);
        return false;
      })
      .finally(function () {
        releaseDateBackfillInFlight = false;
      });
  }

  function maybeRunReleaseDateBackfill(session) {
    if (!session || !session.userId) return;
    if (hasReleaseDateBackfillAttempt(session.userId)) return;
    backfillPostedReleaseDates(session, false).then(function (changed) {
      if (changed) render();
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

  /**
   * Wrap the current selection in a highlight span, or retint if the selection
   * exactly matches an existing highlight. Uses a cloned Range so toolbar
   * handlers can still run after focus moves.
   */
  function wrapLyricsHighlightInEditor(editorId, classSuffix, seqRef) {
    var el = document.getElementById(editorId);
    if (!el) return;
    el.focus();
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0).cloneRange();
    if (!el.contains(range.commonAncestorContainer)) return;

    var ca = range.commonAncestorContainer;
    var host = null;
    if (ca.nodeType === Node.ELEMENT_NODE) {
      if (ca.classList && ca.classList.contains("lyric-hl")) {
        host = ca;
      } else if (typeof ca.closest === "function") {
        host = ca.closest(".lyric-hl");
      }
    } else if (ca.nodeType === Node.TEXT_NODE && ca.parentElement && typeof ca.parentElement.closest === "function") {
      host = ca.parentElement.closest(".lyric-hl");
    }
    if (host && el.contains(host)) {
      var inner = document.createRange();
      inner.selectNodeContents(host);
      if (
        range.compareBoundaryPoints(Range.START_TO_START, inner) === 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, inner) === 0
      ) {
        host.className = "lyric-hl " + classSuffix;
        seqRef.n += 1;
        host.setAttribute("data-noteion-hl-seq", String(seqRef.n));
        sel.removeAllRanges();
        return;
      }
    }

    var span = document.createElement("span");
    span.className = "lyric-hl " + classSuffix;
    try {
      range.surroundContents(span);
    } catch (err) {
      var frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    seqRef.n += 1;
    span.setAttribute("data-noteion-hl-seq", String(seqRef.n));
    sel.removeAllRanges();
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
      streamLinks: normalizeStreamLinks({}),
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

  function setAlbumGenreTagsForAllTracks(tags) {
    var nextTags = Array.isArray(tags) ? tags.slice() : [];
    albumState.tracks.forEach(function (track) {
      if (!track || typeof track !== "object") return;
      track.genreTags = nextTags.slice();
    });
  }

  function commitAlbumTrackFromForm() {
    var idx = albumState.activeIdx;
    var tr = albumState.tracks[idx];
    if (!tr) return;
    tr.title = String($("#album-track-title").val() || "").trim();
    tr.artist = String($("#album-track-artist").val() || "").trim();
    tr.songPublishedAt = parseDateInputToMs($("#album-track-release-date").val());
    tr.meaningText = String($("#album-meaning").val() || "").trim();
    tr.streamLinks = readAlbumStreamLinksFromForm();
    tr.lyricsHtml = getAlbumLyricsHtml();
    tr.stickyNotes = collectAlbumStickies();
    var tags = [];
    $(".js-album-genre-tags .js-album-genre-tag-input:checked").each(function () {
      tags.push(String($(this).val()));
    });
    setAlbumGenreTagsForAllTracks(tags);
    renderAlbumTrackList();
  }

  function fillAlbumFormFromTrack(idx) {
    var tr = albumState.tracks[idx];
    if (!tr) return;
    $("#album-track-title").val(tr.title || "");
    $("#album-track-artist").val(tr.artist || "");
    $("#album-track-release-date").val(msToDateInputValue(tr.songPublishedAt));
    $("#album-meaning").val(tr.meaningText || "");
    setAlbumStreamLinksToForm(tr.streamLinks || {});
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
    return genres
      .filter(function (g) {
        return g && g.name !== skip;
      })
      .slice()
      .sort(function (a, b) {
        var aName = String(a.name || "");
        var bName = String(b.name || "");
        var aIsOther = aName.trim().toLowerCase() === "other";
        var bIsOther = bName.trim().toLowerCase() === "other";
        if (aIsOther && !bIsOther) return 1;
        if (!aIsOther && bIsOther) return -1;
        return aName.localeCompare(bName, undefined, { sensitivity: "base" });
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
    wrapLyricsHighlightInEditor("album-lyrics-ed", classSuffix, albumHlSeqRef);
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
    $("#album-track-release-date").val("");
    $("#album-meaning").val("");
    setAlbumStreamLinksToForm({});
    setAlbumLyricsHtml("");
    renderAlbumStickies([]);
    buildAlbumGenreTags();
    renderAlbumTrackList();
    fillAlbumFormFromTrack(0);
    setAlbumLyricsStatus("");
    hideAlbumLyricsPicks();
    $(".js-album-delete-post").prop("hidden", true);
    albumCoverDataUrl = "";
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
      if (!(tr.genreTags && tr.genreTags.length)) {
        window.alert("Track " + (i + 1) + " needs at least one genre tag.");
        return;
      }
    }

    var coverPersist = albumCoverDataUrl || "";
    if (coverPersist.length > MAX_SONG_COVER_DATA_URL_CHARS) {
      coverPersist = "";
    }

    var $albumPubBtn = $(".js-album-publish-desk");

    function finishAlbumPublish(finalCover) {
      var coverUse = finalCover != null ? finalCover : "";
      if (typeof coverUse !== "string") coverUse = "";
      if (coverUse.length > MAX_SONG_COVER_DATA_URL_CHARS) coverUse = "";

      var publishedAll = window.SongSharePublished.loadAll();
      var deskTracksForSave = [];
      albumState.tracks.forEach(function (tr, i) {
        var existing = publishedAll.find(function (p) {
          return p.id === tr.pubId;
        });
        var songPublishedAt = tr.songPublishedAt || (existing && existing.songPublishedAt ? existing.songPublishedAt : now);
        var trackMeaning = String(tr.meaningText || "").trim();
        var hasTrackMeaning = !!trackMeaning;
        var meaningPublishedAt = existing && existing.meaningPublishedAt ? existing.meaningPublishedAt : null;
        if (hasTrackMeaning && !meaningPublishedAt) {
          meaningPublishedAt = now;
        }
        var trackArtist = String(tr.artist || "").trim() || albumArtist;
        var manualTrackLinks = normalizeStreamLinks(tr.streamLinks || {});
        var autoTrackLinks = buildAutoStreamLinks(trackArtist, tr.title);
        var trackStreamLinks = mergeStreamLinks(autoTrackLinks, manualTrackLinks);
        var entry = {
          id: tr.pubId,
          userId: session.userId,
          displayName: displayName,
          title: tr.title,
          artist: trackArtist,
          lyricsHtml: tr.lyricsHtml || "",
          streamLinks: trackStreamLinks,
          meaningText: hasTrackMeaning ? trackMeaning : "",
          meaningAuthor: hasTrackMeaning ? displayName : "",
          meaningPublishedAt: meaningPublishedAt,
          songPublishedAt: songPublishedAt,
          genreTags: tr.genreTags || [],
          stickyNotes: tr.stickyNotes || [],
          albumId: albumPubId,
          albumTitle: albumTitle,
          albumArtist: albumArtist,
          albumTrackIndex: i,
          albumCoverDataUrl: coverUse,
          createdAt:
            existing && existing.createdAt != null && existing.createdAt !== ""
              ? existing.createdAt
              : tr.createdAt != null && tr.createdAt !== ""
                ? tr.createdAt
                : now,
          updatedAt: now,
        };
        window.SongSharePublished.upsert(entry);
        var o = Object.assign({}, tr, {
          songPublishedAt: songPublishedAt,
          createdAt: entry.createdAt,
        });
        var ta = String(o.artist || "").trim() || albumArtist;
        o.streamLinks = mergeStreamLinks(
          buildAutoStreamLinks(ta, o.title),
          normalizeStreamLinks(o.streamLinks || {})
        );
        delete o.audioDataUrl;
        deskTracksForSave.push(o);
      });

      var albumEntry = {
        kind: "album",
        pubId: albumPubId,
        albumTitle: albumTitle,
        albumArtist: albumArtist,
        albumCoverDataUrl: coverUse,
        tracks: deskTracksForSave,
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
      playPaperPublishSound();

      editingAlbumPubId = null;
      resetAlbumComposer();
      closeAlbumComposer();
      render();
    }

    if (!coverPersist && albumArtist && albumTitle) {
      $albumPubBtn.prop("disabled", true);
      fetchItunesAlbumCoverDataUrl(albumArtist, albumTitle)
        .then(function (fetched) {
          $albumPubBtn.prop("disabled", false);
          finishAlbumPublish(fetched || "");
        })
        .catch(function () {
          $albumPubBtn.prop("disabled", false);
          finishAlbumPublish("");
        });
      return;
    }

    finishAlbumPublish(coverPersist);
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

  function isLyricHlClassToken(c) {
    if (c === "lyric-hl") return true;
    return HL_COLOR_NAMES.some(function (k) {
      return c === "lyric-hl--" + k;
    });
  }

  /** Inline HTML for desk preview: only text, br, and .lyric-hl spans (matches composer). */
  function sanitizeDeskLyricsFragment(root) {
    var html = "";
    for (var i = 0; i < root.childNodes.length; i++) {
      html += sanitizeDeskLyricsNode(root.childNodes[i]);
    }
    return html;
  }

  function sanitizeDeskLyricsNode(node) {
    if (!node) return "";
    if (node.nodeType === 3) {
      return escapeHtml(node.nodeValue || "");
    }
    if (node.nodeType !== 1) return "";
    var tag = node.tagName.toLowerCase();
    if (tag === "br") return "<br>";
    if (tag === "span") {
      var cls = node.getAttribute("class") || "";
      var parts = cls.trim().split(/\s+/).filter(Boolean);
      var hl = parts.filter(isLyricHlClassToken);
      if (hl.indexOf("lyric-hl") !== -1) {
        var safeClass = hl.join(" ").replace(/"/g, "&quot;");
        return '<span class="' + safeClass + '">' + sanitizeDeskLyricsFragment(node) + "</span>";
      }
    }
    if (tag === "p" || tag === "div" || tag === "section") {
      return sanitizeDeskLyricsFragment(node);
    }
    return escapeHtml(node.textContent || "");
  }

  function collectDeskParagraphElements(root) {
    var list = [];
    var c;
    for (c = root.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1 && c.tagName.toLowerCase() === "p") {
        list.push(c);
      }
    }
    if (list.length) return list;
    if (root.children.length === 1) {
      var only = root.children[0];
      var t = only.tagName.toLowerCase();
      if (t === "div" || t === "section") {
        for (c = only.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 1 && c.tagName.toLowerCase() === "p") {
            list.push(c);
          }
        }
      }
    }
    return list;
  }

  function buildDeskLyricsHtml(html) {
    var rawIn = String(html || "").trim();
    if (!rawIn) return "";

    var d = document.createElement("div");
    d.innerHTML = rawIn;

    var pEls = collectDeskParagraphElements(d);
    if (!pEls.length) {
      var qp = d.getElementsByTagName("p");
      if (qp.length) {
        pEls = Array.prototype.slice.call(qp);
      }
    }
    var blocks = [];

    if (pEls.length) {
      pEls.forEach(function (p) {
        var inner = sanitizeDeskLyricsFragment(p);
        if (!(p.textContent || "").trim()) return;
        blocks.push('<p class="desk-card-stanza">' + inner + "</p>");
      });
    } else {
      var inner = sanitizeDeskLyricsFragment(d);
      var plainAll = (d.textContent || "").trim();
      if (!plainAll) return "";
      if (inner.replace(/<br\s*\/?>/gi, "").replace(/\s/g, "").length) {
        blocks.push('<p class="desk-card-stanza">' + inner + "</p>");
      } else {
        if (window.SongShareLyrics && window.SongShareLyrics.normalizeLyricsPlainText) {
          plainAll = window.SongShareLyrics.normalizeLyricsPlainText(plainAll);
        }
        if (!plainAll) return "";
        plainAll.split(/\n\n+/).forEach(function (stanza) {
          var t = stanza.trim();
          if (!t) return;
          blocks.push('<p class="desk-card-stanza">' + escapeHtml(t).replace(/\n/g, "<br>") + "</p>");
        });
      }
    }

    return blocks.length ? blocks.join("") : "";
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
    wrapLyricsHighlightInEditor("composer-lyrics-ed", classSuffix, composerHlSeqRef);
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
    $("#composer-release-date").val("");
    $("#composer-meaning").val("");
    setComposerStreamLinksToForm({});
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
    $("#composer-release-date").val(msToDateInputValue(item.songPublishedAt));
    $("#composer-meaning").val(item.meaningText || "");
    setComposerStreamLinksToForm(item.streamLinks || {});
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

  function fmtPostDay(ts) {
    if (ts == null || ts === "") return "";
    try {
      return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" });
    } catch (e) {
      return "";
    }
  }

  function parsePostedMs(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number" && !isNaN(v) && v > 0) return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim())) {
      var asNum = parseInt(v, 10);
      if (!isNaN(asNum) && asNum > 0) return asNum;
    }
    var n = Date.parse(String(v));
    return !isNaN(n) && n > 0 ? n : NaN;
  }

  /** When the post hit the board (prefer published record; else desk snapshot). */
  function postedMsForDesk(pubId, publishedPostById, fallbackMs) {
    var p = pubId && publishedPostById ? publishedPostById[pubId] : null;
    if (p) {
      var c = parsePostedMs(p.createdAt);
      if (!isNaN(c)) return c;
      var u = parsePostedMs(p.updatedAt);
      if (!isNaN(u)) return u;
    }
    return parsePostedMs(fallbackMs);
  }

  function fmtPostedDateTime(ms) {
    if (isNaN(ms)) return "";
    try {
      return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return "";
    }
  }

  function appendDeskPostedAtRow($host, pubId, publishedPostById, fallbackMs, hasTagsAbove) {
    if (!$host || !$host.length) return;
    var ms = postedMsForDesk(pubId, publishedPostById, fallbackMs);
    var label = fmtPostedDateTime(ms);
    if (!label) return;
    var $p = $("<p/>", {
      class: "desk-card-posted-at" + (hasTagsAbove ? "" : " desk-card-posted-at--solo"),
      text: "Posted " + label,
    });
    $host.append($p);
  }

  /** Same chip row as song sheet footer: board colors + automatic “All genres”. */
  function appendDeskGenreTagsRow($container, genreTags) {
    var SP = window.SongSharePublished;
    var tags =
      SP && typeof SP.displayGenreTagsWithAllSlot === "function"
        ? SP.displayGenreTagsWithAllSlot(genreTags, null)
        : Array.isArray(genreTags)
          ? genreTags.filter(Boolean)
          : [];
    var genres = window.SONG_SHARE_GENRES || [];
    tags.forEach(function (tag, i) {
      if (i) {
        $container.append(document.createTextNode(" \u00b7 "));
      }
      var t = String(tag != null ? tag : "").trim();
      if (!t) return;
      var hsl =
        SP && typeof SP.genreBoardHslByName === "function" ? SP.genreBoardHslByName(t) : "";
      var crateHref = "";
      for (var j = 0; j < genres.length; j++) {
        if (genres[j] && String(genres[j].name || "").trim() === t) {
          crateHref = "crate.html?genre=" + encodeURIComponent(String(j + 1));
          break;
        }
      }
      var $node;
      if (crateHref) {
        $node = $("<a/>", {
          class: "desk-card-genre-chip",
          href: crateHref,
          text: t,
          title: "Open " + t + " crate",
        });
      } else {
        $node = $("<span/>", { class: "desk-card-genre-chip", text: t });
      }
      if (hsl) {
        $node.css("color", hsl);
      } else {
        $node.addClass("desk-card-genre-chip--fallback");
      }
      $container.append($node);
    });
  }

  /** Use stored desk stickies, or fall back to published post data when the desk snapshot is older. */
  function resolvedDeskStickyNotes(pubId, localNotes, publishedPostById) {
    var loc = Array.isArray(localNotes) ? localNotes : [];
    if (loc.length || !pubId || !publishedPostById) return loc;
    var p = publishedPostById[pubId];
    return p && Array.isArray(p.stickyNotes) ? p.stickyNotes : [];
  }

  function deskHasRenderableSticky(notes) {
    if (!Array.isArray(notes) || !notes.length) return false;
    return notes.some(function (n) {
      if (!n || typeof n !== "object") return false;
      return String(n.text != null ? n.text : "").trim().length > 0;
    });
  }

  /**
   * Lyrics + margin slips like the public song sheet (detail-lyrics-scroll-inner +
   * song-stickies), not a footer “Annotations” list.
   */
  function mountDeskLyricsWithStickies($host, rawLyricsHtml, stickyNotes) {
    if (!$host || !$host.length) return;
    var notes = Array.isArray(stickyNotes) ? stickyNotes : [];
    var lyricsBlock = buildDeskLyricsHtml(rawLyricsHtml || "");
    if (!lyricsBlock.trim() && !deskHasRenderableSticky(notes)) return;

    var $scroll = $('<div class="desk-lyrics-scroll" />');
    var $inner = $('<div class="desk-lyrics-scroll-inner" />');
    var $lyrics = $('<div class="desk-card-lyrics js-desk-lyrics" />').html(lyricsBlock);
    var $stickies = $('<div class="song-stickies js-desk-stickies" aria-hidden="true" />');
    $inner.append($lyrics, $stickies);
    $scroll.append($inner);
    $host.append($scroll);
    renderDeskStickiesInInner($inner, notes);
  }

  function renderDeskStickiesInInner($inner, notes) {
    var innerEl = $inner.get(0);
    var $z = $inner.find(".js-desk-stickies").empty();
    if (!notes || !notes.length) {
      $z.attr("aria-hidden", "true");
      return;
    }
    var any = false;
    notes.forEach(function (n, i) {
      if (!n || typeof n !== "object") return;
      var body = String(n.text != null ? n.text : "").trim();
      if (!body) return;
      any = true;
      var hasHlIdx = typeof n.highlightIndex === "number" && !isNaN(n.highlightIndex);
      var hlIdx = hasHlIdx ? n.highlightIndex : i;
      var legacy =
        !hasHlIdx &&
        (n.left != null || n.top != null) &&
        (typeof n.left === "number" ||
          typeof n.left === "string" ||
          typeof n.top === "number" ||
          typeof n.top === "string");

      var $s = $('<div class="song-sticky" />').text(body);
      if (legacy) {
        var left = typeof n.left === "number" ? n.left : parseFloat(n.left);
        var top = typeof n.top === "number" ? n.top : parseFloat(n.top);
        if (isNaN(left)) left = 8;
        if (isNaN(top)) top = 12;
        $s.addClass("song-sticky--legacy").css({ left: left + "%", top: top + "%" });
      } else {
        $s.addClass("song-sticky--right").attr("data-hl-idx", String(hlIdx));
        if (typeof n.topPx === "number" && !isNaN(n.topPx)) {
          $s.attr("data-top-px", String(n.topPx));
        }
        var sc = n.slipColor;
        if (sc && /^(amber|mint|rose|sky)$/.test(String(sc))) {
          $s.addClass("song-sticky--" + sc);
        }
      }
      $z.append($s);
    });
    if (any) {
      $z.removeAttr("aria-hidden");
    } else {
      $z.attr("aria-hidden", "true");
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        relayoutDeskStickiesInInner(innerEl);
      });
    });
  }

  function relayoutDeskStickiesInInner(innerEl) {
    if (!innerEl) return;
    var lyricsRoot = innerEl.querySelector(".js-desk-lyrics");
    if (!lyricsRoot) return;
    var hls = lyricsRoot.querySelectorAll(".lyric-hl");
    var br = innerEl.getBoundingClientRect();
    $(innerEl)
      .find(".js-desk-stickies .song-sticky")
      .not(".song-sticky--legacy")
      .each(function () {
        var $el = $(this);
        var fixed = $el.attr("data-top-px");
        if (fixed != null && fixed !== "") {
          var px = parseFloat(fixed);
          if (!isNaN(px)) {
            $el.css("top", Math.round(px) + "px");
          }
          return;
        }
        var idx = parseInt($el.attr("data-hl-idx"), 10);
        if (isNaN(idx)) return;
        var hl = hls[idx];
        if (!hl) return;
        var hr = hl.getBoundingClientRect();
        var centerY = hr.top - br.top + hr.height / 2;
        $el.css("top", Math.round(centerY) + "px");
      });
  }

  var deskStickyLayoutTimer = null;
  function scheduleDeskStickyRelayout() {
    if (deskStickyLayoutTimer) window.clearTimeout(deskStickyLayoutTimer);
    deskStickyLayoutTimer = window.setTimeout(function () {
      deskStickyLayoutTimer = null;
      document.querySelectorAll(".desk-lyrics-scroll-inner").forEach(function (el) {
        relayoutDeskStickiesInInner(el);
      });
    }, 100);
  }

  function relayoutAllDeskStickiesNow() {
    document.querySelectorAll(".desk-lyrics-scroll-inner").forEach(function (el) {
      relayoutDeskStickiesInInner(el);
    });
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

    var publishedPostById = {};
    if (window.SongSharePublished && typeof window.SongSharePublished.loadAll === "function") {
      window.SongSharePublished.loadAll().forEach(function (p) {
        if (p && p.id) {
          publishedPostById[p.id] = p;
        }
      });
    }

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
          "data-desk-album-idx": "0",
          "aria-label": "Edit album: " + alTitle,
        });
        var $inner = $('<div class="desk-card-inner desk-card-inner--album">');
        var tracks = item.tracks || [];
        var n = tracks.length;

        var $tabBar = $('<div class="desk-album-tab-bar" role="toolbar" aria-label="Album and track navigation" tabindex="0" />');
        var navChevLeft =
          '<svg class="desk-album-nav__svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" d="M14.5 7.5 9 12l5.5 4.5"/></svg>';
        var navChevRight =
          '<svg class="desk-album-nav__svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" d="M9.5 7.5 15 12l-5.5 4.5"/></svg>';
        var $prev = $('<button type="button" class="desk-album-nav desk-album-nav--prev js-desk-album-prev" aria-label="Previous song" />').html(
          navChevLeft
        );
        var $next = $('<button type="button" class="desk-album-nav desk-album-nav--next js-desk-album-next" aria-label="Next song" />').html(
          navChevRight
        );
        var $tabMain = $('<div class="desk-album-tab-main" />');
        $tabMain.append($('<span class="desk-album-tab-badge">Album</span>'));
        $tabMain.append($("<span/>", { class: "desk-album-tab-title", text: alTitle }));
        if (alArtist) {
          $tabMain.append($("<span/>", { class: "desk-album-tab-artist", text: alArtist }));
        }
        $tabMain.append(
          $("<span/>", {
            class: "desk-album-tab-counter",
            text: n ? "1 / " + n : "0 / 0",
            "aria-live": "polite",
          })
        );
        $tabBar.append($prev, $tabMain, $next);
        $inner.append($tabBar);

        var $panelsWrap = $('<div class="desk-album-track-panels" />');
        if (!tracks.length) {
          $panelsWrap.append($('<p class="desk-album-empty" />').text("No tracks yet."));
          $prev.prop("disabled", true);
          $next.prop("disabled", true);
        } else {
          tracks.forEach(function (tr, ti) {
            var tTitle = String(tr.title || "Untitled").trim() || "Untitled";
            var tArtist = String(tr.artist || alArtist || "").trim();
            var tPublished = fmtPostDay(tr.songPublishedAt || tr.createdAt);
            var $panel = $("<div/>", {
              class: "desk-album-track-panel",
              role: "group",
              "data-track-idx": String(ti),
              "aria-label": tTitle + " — track " + (ti + 1) + " of " + n,
            });
            if (ti !== 0) {
              $panel.attr("hidden", "hidden").attr("aria-hidden", "true");
            } else {
              $panel.attr("aria-hidden", "false");
            }
            var $head = $('<header class="desk-card-head" />');
            $head.append($("<h3/>", { class: "desk-card-title", text: tTitle }));
            if (tArtist) {
              $head.append($("<p/>", { class: "desk-card-artist", text: tArtist }));
            }
            if (tPublished) {
              $head.append($("<p/>", { class: "desk-card-date", text: "Published " + tPublished }));
            }
            $panel.append($head);
            mountDeskLyricsWithStickies(
              $panel,
              tr.lyricsHtml || "",
              resolvedDeskStickyNotes(tr.pubId, tr.stickyNotes, publishedPostById)
            );
            var $deskTags = $('<p class="desk-card-tags desk-card-tags--chips" />');
            appendDeskGenreTagsRow($deskTags, tr.genreTags);
            var hasTags = !!$deskTags.contents().length;
            if (hasTags) {
              $panel.append($deskTags);
            }
            appendDeskPostedAtRow(
              $panel,
              tr.pubId,
              publishedPostById,
              tr.createdAt || item.createdAt,
              hasTags
            );
            $panelsWrap.append($panel);
          });
          $prev.prop("disabled", true);
          $next.prop("disabled", n <= 1);
        }
        $inner.append($panelsWrap);
        $card.append($inner);
      } else {
        var published = fmtPostDay(item.songPublishedAt || item.createdAt);
        $card = $("<article/>", {
          class: "desk-card",
          role: "button",
          tabindex: 0,
          "data-pub-id": item.pubId,
          "aria-label": "Edit: " + String(item.title || "song"),
        });
        var $inner = $('<div class="desk-card-inner">');
        var $head = $('<header class="desk-card-head">');
        $head.append($("<h3/>", { class: "desk-card-title", text: item.title || "Untitled" }));
        if (item.artist) {
          $head.append($("<p/>", { class: "desk-card-artist", text: item.artist }));
        }
        if (published) {
          $head.append($("<p/>", { class: "desk-card-date", text: "Published " + published }));
        }
        $inner.append($head);
        mountDeskLyricsWithStickies(
          $inner,
          item.lyricsHtml || "",
          resolvedDeskStickyNotes(item.pubId, item.stickyNotes, publishedPostById)
        );
        var $deskTags = $('<p class="desk-card-tags desk-card-tags--chips" />');
        appendDeskGenreTagsRow($deskTags, item.genreTags);
        var hasTags = !!$deskTags.contents().length;
        if (hasTags) {
          $inner.append($deskTags);
        }
        appendDeskPostedAtRow($inner, item.pubId, publishedPostById, item.createdAt, hasTags);
        $card.append($inner);
      }
      $card.css({
        zIndex: 10 + index,
        "--desk-rot": deskRot(index) + "deg",
      });
      $profileDesk.append($card);
    });
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(relayoutAllDeskStickiesNow);
    });
  }

  function publish() {
    var session = window.SongShareAuth.getSession();
    if (!session) return;

    var title = String($("#composer-track-title").val() || "").trim();
    var artist = String($("#composer-artist").val() || "").trim();
    var manualReleaseMs = parseDateInputToMs($("#composer-release-date").val());
    var meaningText = String($("#composer-meaning").val() || "").trim();
    var manualStreamLinks = readComposerStreamLinksFromForm();
    var autoStreamLinks = buildAutoStreamLinks(artist, title);
    var streamLinks = mergeStreamLinks(autoStreamLinks, manualStreamLinks);
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

    fetchItunesSongMeta(artist, title)
      .then(function (meta) {
        setLyricsStatus("");
        var fetchedCover = meta && meta.coverDataUrl ? meta.coverDataUrl : null;
        var fetchedReleaseMs = meta && meta.songPublishedAt ? meta.songPublishedAt : null;
        if (!manualReleaseMs && fetchedReleaseMs) {
          $("#composer-release-date").val(msToDateInputValue(fetchedReleaseMs));
        }
        execPublishSong(
          session,
          title,
          artist,
          manualReleaseMs,
          meaningText,
          streamLinks,
          lyricsHtml,
          genreTags,
          fetchedCover,
          fetchedReleaseMs
        );
      })
      .catch(function () {
        setLyricsStatus("");
        execPublishSong(
          session,
          title,
          artist,
          manualReleaseMs,
          meaningText,
          streamLinks,
          lyricsHtml,
          genreTags,
          null,
          null
        );
      })
      .finally(function () {
        $btn.prop("disabled", false);
      });
  }

  function execPublishSong(
    session,
    title,
    artist,
    manualReleaseMs,
    meaningText,
    streamLinks,
    lyricsHtml,
    genreTags,
    fetchedCover,
    fetchedReleaseMs
  ) {
    var now = Date.now();
    var pubId =
      editingPubId ||
      "pub_" + now + "_" + Math.random().toString(36).slice(2, 9);
    var displayName = session.displayName || session.email || "Member";
    var existing = editingPubId ? findUpload(session, editingPubId) : null;
    var existingPublished =
      editingPubId && window.SongSharePublished && typeof window.SongSharePublished.loadAll === "function"
        ? window.SongSharePublished.loadAll().find(function (p) {
            return p.id === editingPubId;
          })
        : null;
    var preservedPostCreatedAt = !editingPubId
      ? now
      : existingPublished && existingPublished.createdAt != null && existingPublished.createdAt !== ""
        ? existingPublished.createdAt
        : existing && existing.createdAt != null && existing.createdAt !== ""
          ? existing.createdAt
          : now;
    var songPublishedAt =
      manualReleaseMs || fetchedReleaseMs || (existing && existing.songPublishedAt ? existing.songPublishedAt : now);
    var hasMeaning = !!meaningText;
    var meaningPublishedAt = existing && existing.meaningPublishedAt ? existing.meaningPublishedAt : null;
    if (hasMeaning && !meaningPublishedAt) {
      meaningPublishedAt = now;
    }

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
      streamLinks: normalizeStreamLinks(streamLinks),
      meaningText: hasMeaning ? meaningText : "",
      meaningAuthor: hasMeaning ? displayName : "",
      meaningPublishedAt: meaningPublishedAt,
      songPublishedAt: songPublishedAt,
      genreTags: genreTags,
      stickyNotes: collectStickies(),
      albumCoverDataUrl: cover || "",
      createdAt: preservedPostCreatedAt,
      updatedAt: now,
    };

    if (editingPubId) {
      window.SongSharePublished.upsert(entry);
    } else {
      window.SongSharePublished.add(entry);
    }
    window.SongShareUploads.add(session.userId, Object.assign({ pubId: pubId }, entry));
    window.SongSharePublished.applyMerge();
    playPaperPublishSound();

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
        refreshComposerLinkFieldsFromTrack(artist, title);
        setLyricsStatus("Lyrics loaded.");
        autoFillReleaseDateInput("#composer-release-date", artist, title);
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

    /* Keep lyrics selection when using highlighter swatches (click would move focus and collapse the range). */
    $(document).on("mousedown", ".composer-hl-tools [data-hl]", function (e) {
      e.preventDefault();
    });

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
    $(window).on("resize", scheduleDeskStickyRelayout);
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

    function setDeskAlbumTrackIndex($card, idx) {
      var $panels = $card.find(".desk-album-track-panel");
      var n = $panels.length;
      if (!n) return;
      idx = Math.max(0, Math.min(n - 1, idx));
      $card.attr("data-desk-album-idx", String(idx));
      $panels.each(function (i) {
        var $p = $(this);
        if (i === idx) {
          $p.removeAttr("hidden").attr("aria-hidden", "false");
        } else {
          $p.attr("hidden", "hidden").attr("aria-hidden", "true");
        }
      });
      $card.find(".js-desk-album-prev").prop("disabled", idx <= 0);
      $card.find(".js-desk-album-next").prop("disabled", idx >= n - 1);
      $card.find(".desk-album-tab-counter").text(idx + 1 + " / " + n);
      scheduleDeskStickyRelayout();
    }

    $("#profile-desk").on("click", ".desk-card-genre-chip", function (e) {
      e.stopPropagation();
    });

    $("#profile-desk").on("click", ".js-desk-album-prev", function (e) {
      e.stopPropagation();
      var $card = $(this).closest(".desk-card--album");
      var idx = parseInt($card.attr("data-desk-album-idx"), 10) || 0;
      setDeskAlbumTrackIndex($card, idx - 1);
    });

    $("#profile-desk").on("click", ".js-desk-album-next", function (e) {
      e.stopPropagation();
      var $card = $(this).closest(".desk-card--album");
      var idx = parseInt($card.attr("data-desk-album-idx"), 10) || 0;
      setDeskAlbumTrackIndex($card, idx + 1);
    });

    $("#profile-desk").on("keydown", ".desk-album-tab-bar", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var $bar = $(this);
      var $card = $bar.closest(".desk-card--album");
      var idx = parseInt($card.attr("data-desk-album-idx"), 10) || 0;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        setDeskAlbumTrackIndex($card, idx - 1);
      } else {
        e.preventDefault();
        e.stopPropagation();
        setDeskAlbumTrackIndex($card, idx + 1);
      }
    });

    $("#profile-desk").on("click", ".desk-card", function (e) {
      if ($(e.target).closest(".js-desk-album-prev, .js-desk-album-next").length) return;
      activateDeskCard($(this));
    });

    $("#profile-desk").on("keydown", ".desk-card", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      if ($(e.target).closest(".desk-album-tab-bar").length) {
        if (e.key === " ") e.preventDefault();
        return;
      }
      e.preventDefault();
      activateDeskCard($(this));
    });

    $(".js-composer-delete-post").on("click", function () {
      var sess = window.SongShareAuth.getSession();
      if (!sess || !editingPubId) return;
      if (!window.confirm("Remove from your desk and unpublish from the genre board?")) return;
      window.SongShareUploads.remove(sess.userId, editingPubId);
      playDeleteActionSound();
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
      playDeleteActionSound();
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
      var seedTags =
        albumState.tracks.length && Array.isArray(albumState.tracks[0].genreTags)
          ? albumState.tracks[0].genreTags
          : [];
      var tr = newAlbumTrack();
      tr.genreTags = seedTags.slice();
      albumState.tracks.push(tr);
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
        if (albumState.tracks.length && Array.isArray(albumState.tracks[0].genreTags)) {
          tr.genreTags = albumState.tracks[0].genreTags.slice();
        }
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
          refreshAlbumLinkFieldsFromTrack(artist, title);
          setAlbumLyricsStatus("Lyrics loaded.");
          autoFillReleaseDateInput("#album-track-release-date", artist, title);
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

    function maybeOpenComposerFromQuery() {
      var search = window.location && window.location.search ? window.location.search : "";
      if (!search) return;
      var params;
      try {
        params = new URLSearchParams(search);
      } catch (e) {
        return;
      }
      var compose = String(params.get("compose") || "").toLowerCase();
      if (compose !== "song" && compose !== "album") return;
      if (!window.SongShareAuth || !window.SongShareAuth.getSession || !window.SongShareAuth.getSession()) return;
      if (compose === "album") {
        closeComposer();
        resetComposer();
        resetAlbumComposer();
        openAlbumComposer();
      } else {
        closeAlbumComposer();
        resetAlbumComposer();
        resetComposer();
        openComposer();
      }
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, "profile.html");
      }
    }

    function bootProfile() {
      var wr = window.SongShareAuth && window.SongShareAuth.whenReady;
      if (typeof wr === "function") {
        wr
          .call(window.SongShareAuth)
          .then(function () {
            render();
            var sess = window.SongShareAuth && window.SongShareAuth.getSession
              ? window.SongShareAuth.getSession()
              : null;
            maybeRunLegacyCoverBackfill(sess);
            maybeRunReleaseDateBackfill(sess);
            maybeOpenComposerFromQuery();
          })
          .catch(function () {
            render();
            var sess = window.SongShareAuth && window.SongShareAuth.getSession
              ? window.SongShareAuth.getSession()
              : null;
            maybeRunLegacyCoverBackfill(sess);
            maybeRunReleaseDateBackfill(sess);
            maybeOpenComposerFromQuery();
          });
      } else {
        render();
        var sess = window.SongShareAuth && window.SongShareAuth.getSession
          ? window.SongShareAuth.getSession()
          : null;
        maybeRunLegacyCoverBackfill(sess);
        maybeRunReleaseDateBackfill(sess);
        maybeOpenComposerFromQuery();
      }
    }

    window.NoteionRunLegacyCoverBackfill = function () {
      var sess = window.SongShareAuth && window.SongShareAuth.getSession
        ? window.SongShareAuth.getSession()
        : null;
      if (!sess) return Promise.resolve(false);
      return backfillLegacyMissingCovers(sess).then(function (changed) {
        if (changed) render();
        return changed;
      });
    };

    window.NoteionRunReleaseDateBackfill = function (force) {
      var sess = window.SongShareAuth && window.SongShareAuth.getSession
        ? window.SongShareAuth.getSession()
        : null;
      if (!sess) return Promise.resolve(false);
      return backfillPostedReleaseDates(sess, !!force).then(function (changed) {
        if (changed) render();
        return changed;
      });
    };

    window.addEventListener("songshare:authed", render);
    bootProfile();
  });
})(jQuery);
