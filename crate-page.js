/**
 * Build cratedigger record list for ?genre=1..N (matches home genre-card ids).
 * Waits for SongShareRemoteSync so merged posts (local + Supabase) match the home board.
 * Cover art: genre.boardTrackCoverUrls from mergeGenres (same per-post art as the board feed);
 * demo stacks use SongSharePublished.makeSongFallbackCoverDataUrl.
 * SVG fallbacks are rasterized to PNG so WebGL (Three.js) can texture them reliably.
 * Loads cratedigger only after window.__NOTEION_CRATE_RECORDS__ is set.
 * Genre preview clip (genre-clips / fallback) loops during load and while browsing the 3D stacks.
 */
(function () {
  "use strict";

  try {
    if (!window.__NOTEION_CRATE_TEXTURE_URL__) {
      window.__NOTEION_CRATE_TEXTURE_URL__ = new URL(
        "cratedigger-lib/images/wood.jpg",
        window.location.href
      ).href;
    }
  } catch (err) {
    if (!window.__NOTEION_CRATE_TEXTURE_URL__) {
      window.__NOTEION_CRATE_TEXTURE_URL__ = "cratedigger-lib/images/wood.jpg";
    }
  }

  /** Delay before the full-screen fade starts (overlay + navigate run after this + POST_VIEW_FADE_MS). */
  var POST_VIEW_PAUSE_MS = 0;
  var POST_VIEW_FADE_MS = 3200;
  var postTransitionPauseTimer = null;
  var postTransitionFadeTimer = null;

  window.__NOTEION_BEGIN_POST_TRANSITION__ = function (href) {
    var url = String(href || "").trim();
    if (!url) return;

    if (postTransitionPauseTimer) {
      clearTimeout(postTransitionPauseTimer);
      postTransitionPauseTimer = null;
    }
    if (postTransitionFadeTimer) {
      clearTimeout(postTransitionFadeTimer);
      postTransitionFadeTimer = null;
    }

    var existing = document.querySelector(".crate-post-transition");
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    postTransitionPauseTimer = setTimeout(function () {
      postTransitionPauseTimer = null;
      var ov = document.createElement("div");
      ov.className = "crate-post-transition";
      ov.setAttribute("aria-hidden", "true");
      document.body.appendChild(ov);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          ov.classList.add("crate-post-transition--active");
        });
      });
      postTransitionFadeTimer = setTimeout(function () {
        postTransitionFadeTimer = null;
        window.location.href = url;
      }, POST_VIEW_FADE_MS);
    }, POST_VIEW_PAUSE_MS);
  };

  /** Must match cratedigger `recordsPerCrate` (24) in the vendored bundle. */
  var CRATEDIGGER_RECORDS_PER_CRATE = 24;
  /** Cap total records pulled into the crate view (enough for several crate rows). */
  var MAX_RECORDS = 200;
  /** Safety cap on 3D crate objects (ceil(MAX_RECORDS / CRATEDIGGER_RECORDS_PER_CRATE) ≤ this). */
  var MAX_CRATE_OBJECTS = 16;

  function computeNbCratesForRecordCount(n) {
    var count = Math.max(1, Math.floor(Number(n) || 0));
    return Math.max(
      1,
      Math.min(MAX_CRATE_OBJECTS, Math.ceil(count / CRATEDIGGER_RECORDS_PER_CRATE))
    );
  }

  /** Same hue sweep as home genre cards (noteion-home.js genreOverlayColor). */
  function genreHue(rank, total) {
    var t = total && total > 1 ? (rank - 1) / (total - 1) : 0;
    var startHue = 330;
    var endHue = 690;
    return (startHue + (endHue - startHue) * t) % 360;
  }

  /** Same rainbow tint string as homepage `--genre-overlay`. */
  function crateGenreOverlayHSL(rank, total) {
    return "hsl(" + genreHue(rank, total).toFixed(1) + ", 20%, 56%)";
  }

  /** HSL (deg, 0–100, 0–100) → 0xRRGGBB for Three.js setClearColor. */
  function hslToRgbInt(hDeg, sPct, lPct) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var h = ((hDeg % 360) + 360) % 360;
    var s = Math.max(0, Math.min(100, sPct)) / 100;
    var l = Math.max(0, Math.min(100, lPct)) / 100;
    var r;
    var g;
    var b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      var hn = h / 360;
      r = hue2rgb(p, q, hn + 1 / 3);
      g = hue2rgb(p, q, hn);
      b = hue2rgb(p, q, hn - 1 / 3);
    }
    return (
      (Math.round(r * 255) << 16) |
      (Math.round(g * 255) << 8) |
      Math.round(b * 255)
    );
  }

  /** CSS `--crate-genre-overlay`, WebGL clear color, loading layer (matches homepage genre). */
  function applyCrateGenreChrome(rank, total) {
    var overlay = crateGenreOverlayHSL(rank, total);
    document.documentElement.style.setProperty("--crate-genre-overlay", overlay);
    var ld = document.getElementById("cratedigger-loading");
    if (ld) {
      ld.style.setProperty("--crate-genre-overlay", overlay);
    }
    if (typeof window !== "undefined") {
      window.__NOTEION_CRATE_BG_COLOR__ = hslToRgbInt(genreHue(rank, total), 20, 56);
      /* Let CSS gradients on #cratedigger-canvas show through empty / cleared pixels */
      window.__NOTEION_CRATE_GRADIENT_BG__ = true;
    }
  }

  function resolveAudioUrl(path) {
    var p = String(path || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    try {
      return new URL(p, window.location.href).href;
    } catch (e) {
      return p;
    }
  }

  var crateGenreAudio = null;
  var crateLoadingAriaPollTimer = null;
  var crateCameraLockRaf = 0;
  var crateLockedPose = null;

  function tryPlayCrateGenreAudio() {
    if (!crateGenreAudio) return;
    if (crateGenreAudio.paused) {
      var p = crateGenreAudio.play();
      if (p && typeof p.catch === "function") {
        p.catch(function () {});
      }
    }
  }

  function stopCrateGenreAudio() {
    if (crateLoadingAriaPollTimer) {
      clearInterval(crateLoadingAriaPollTimer);
      crateLoadingAriaPollTimer = null;
    }
    window.__NOTEION_CRATE_NAV__ = undefined;
    if (!crateGenreAudio) return;
    try {
      crateGenreAudio.pause();
      crateGenreAudio.removeAttribute("src");
      crateGenreAudio.load();
    } catch (e) {}
    crateGenreAudio = null;
    var ld = document.getElementById("cratedigger-loading");
    if (ld) {
      ld.setAttribute("aria-busy", "false");
    }
  }

  function pickCrateLoadingClip(genre) {
    var name = String((genre && genre.name) || "").trim().toLowerCase();
    if (name === "all genres") {
      return {
        primary: "genre-clips/fassounds-good-night-lofi-cozy-chill-music-160166.mp3",
        fallback: (genre && genre.audioFallback) || "",
      };
    }
    return {
      primary: (genre && genre.audio) || "",
      fallback: (genre && genre.audioFallback) || "",
    };
  }

  /** When the loading overlay hides, clear busy — do not stop genre audio (keeps playing in 3D view). */
  function wireCrateLoadingAriaOnly(ld) {
    if (!ld) return;
    if (crateLoadingAriaPollTimer) {
      clearInterval(crateLoadingAriaPollTimer);
      crateLoadingAriaPollTimer = null;
    }
    crateLoadingAriaPollTimer = setInterval(function () {
      if (ld.classList.contains("is-noteion-dismissed")) {
        clearInterval(crateLoadingAriaPollTimer);
        crateLoadingAriaPollTimer = null;
        ld.setAttribute("aria-busy", "false");
        return;
      }
      var op = parseFloat(window.getComputedStyle(ld).opacity || "1");
      if (op < 0.06 || ld.style.display === "none") {
        clearInterval(crateLoadingAriaPollTimer);
        crateLoadingAriaPollTimer = null;
        ld.setAttribute("aria-busy", "false");
      }
    }, 180);
    function onTrans(ev) {
      if (ev.target !== ld || ev.propertyName !== "opacity") return;
      var op = parseFloat(window.getComputedStyle(ld).opacity || "1");
      if (op < 0.06) {
        ld.removeEventListener("transitionend", onTrans);
        ld.setAttribute("aria-busy", "false");
      }
    }
    ld.addEventListener("transitionend", onTrans);
    setTimeout(function () {
      if (crateLoadingAriaPollTimer) {
        clearInterval(crateLoadingAriaPollTimer);
        crateLoadingAriaPollTimer = null;
      }
    }, 120000);
  }

  function setupCrateGenreAudioUi() {
    window.__NOTEION_CRATE_NAV__ = tryPlayCrateGenreAudio;
    var root = document.getElementById("cratedigger");
    if (root) {
      root.addEventListener("pointerdown", tryPlayCrateGenreAudio, { passive: true });
      root.addEventListener("keydown", tryPlayCrateGenreAudio, { passive: true });
    }
    window.addEventListener(
      "beforeunload",
      function () {
        stopCrateGenreAudio();
      },
      { passive: true }
    );
    document.addEventListener(
      "visibilitychange",
      function () {
        if (!crateGenreAudio) return;
        if (document.hidden) {
          try {
            crateGenreAudio.pause();
          } catch (e) {}
        } else {
          tryPlayCrateGenreAudio();
        }
      },
      { passive: true }
    );
  }

  function startCrateGenreAudio(genre) {
    stopCrateGenreAudio();
    var clips = pickCrateLoadingClip(genre);
    var primary = resolveAudioUrl(clips.primary);
    if (!primary) {
      primary = resolveAudioUrl(clips.fallback);
    }
    if (!primary) return;
    var a = new Audio();
    a.preload = "auto";
    a.loop = true;
    a.volume = 0.42;
    a.playsInline = true;
    crateGenreAudio = a;
    var ld = document.getElementById("cratedigger-loading");
    if (ld) {
      ld.setAttribute("aria-busy", "true");
    }
    var triedFallback = false;
    a.addEventListener(
      "error",
      function onErr() {
        if (triedFallback || !clips.fallback) return;
        triedFallback = true;
        a.removeEventListener("error", onErr);
        var fb = resolveAudioUrl(clips.fallback);
        if (!fb) return;
        a.src = fb;
        a.load();
        var p2 = a.play();
        if (p2 && typeof p2.catch === "function") {
          p2.catch(function () {});
        }
      },
      { once: true }
    );
    a.src = primary;
    a.load();
    var p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {});
    }
    wireCrateLoadingAriaOnly(ld);
  }

  function appendScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.async = false;
      el.onload = function () {
        resolve();
      };
      el.onerror = function () {
        reject(new Error("Failed to load script: " + src));
      };
      document.body.appendChild(el);
    });
  }

  function freezeCrateNavigationCameraTweens() {
    var T = typeof window !== "undefined" ? window.TWEEN : null;
    if (!T || !T.Tween || !T.Tween.prototype || T.Tween.prototype.__noteionCameraFreezePatched) {
      return;
    }
    var originalTo = T.Tween.prototype.to;
    if (typeof originalTo !== "function") return;

    T.Tween.prototype.to = function (properties, duration) {
      var props = properties;
      var obj = this && this._object;
      if (
        props &&
        obj &&
        typeof props === "object" &&
        typeof obj === "object" &&
        typeof props.x === "number" &&
        typeof props.y === "number" &&
        typeof obj.x === "number" &&
        typeof obj.y === "number" &&
        /* Cratedigger camera/target tweens use high Y values (>= ~75). */
        props.y > 60
      ) {
        props = Object.assign({}, props, {
          x: obj.x,
          y: obj.y,
          z: typeof props.z === "number" && typeof obj.z === "number" ? obj.z : props.z,
        });
        duration = 0;
      }
      return originalTo.call(this, props, duration);
    };
    T.Tween.prototype.__noteionCameraFreezePatched = true;
  }

  function findCameraAndControls(root) {
    if (!root || typeof root !== "object") return null;
    var seen = [];
    var foundCamera = null;
    var foundControls = null;
    function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 22) return;
      if (seen.indexOf(node) !== -1) return;
      seen.push(node);
      if (
        !foundCamera &&
        (node.isCamera === true ||
          (node.position &&
            typeof node.lookAt === "function" &&
            node.projectionMatrix &&
            typeof node.updateProjectionMatrix === "function"))
      ) {
        foundCamera = node;
      }
      if (!foundControls && node.target && typeof node.update === "function") {
        foundControls = node;
      }
      if (foundCamera && foundControls) return;
      var keys;
      try {
        keys = Reflect.ownKeys(node);
      } catch (e) {
        keys = Object.keys(node);
      }
      for (var i = 0; i < keys.length; i++) {
        var child;
        try {
          child = node[keys[i]];
        } catch (e) {
          continue;
        }
        if (!child || typeof child !== "object") continue;
        walk(child, depth + 1);
        if (foundCamera && foundControls) return;
      }
    }
    walk(root, 0);
    if (!foundCamera) return null;
    return {
      camera: foundCamera,
      controls: foundControls,
    };
  }

  function getCrateCameraAndTarget() {
    var api = window.__NOTEION_CRATEDIGGER__;
    if (!api) return null;
    var cm = api.__noteionCameraManager;
    if (!cm || typeof cm.getCamera !== "function" || typeof cm.getTarget !== "function") {
      return null;
    }
    var camera = cm.getCamera();
    var target = cm.getTarget();
    if (!camera || !camera.position) return null;
    if (!target || !target.position) return null;
    return { camera: camera, target: target, cameraManager: cm };
  }

  /**
   * Fixed crate camera pose. Dialed in with the dev camera tuner:
   *   yaw 89.54°, pitch 51.00°, distance 457.839 around the default target.
   * Kept as plain numbers so we're not re-running spherical math each frame.
   */
  var CRATE_CAMERA_POSE = {
    camera: { x: 335.796, y: 298.127, z: 2.880 },
    target: { x: -20.0, y: 10.0, z: 0.0 },
  };

  function captureCrateCameraPose() {
    var ref = getCrateCameraAndTarget();
    if (!ref) return;
    var cam = ref.camera;
    var tgt = ref.target;
    var api = window.__NOTEION_CRATEDIGGER__;
    var consts = api && api.__noteionConstants;
    var sceneC = consts && consts.scene;

    if (consts) {
      /* Disable the library's mouse-driven scene rotation so the camera actually locks. */
      consts.cameraMouseMove = false;
    }
    /* Overwrite the library's base positions so any internal resetCamera()
       (which does run during init / on record close) tweens toward our
       locked pose instead of the stock (280,200,180) → (-20,10,0). */
    if (sceneC && sceneC.cameraBasePosition) {
      sceneC.cameraBasePosition.x = CRATE_CAMERA_POSE.camera.x;
      sceneC.cameraBasePosition.y = CRATE_CAMERA_POSE.camera.y;
      sceneC.cameraBasePosition.z = CRATE_CAMERA_POSE.camera.z;
    }
    if (sceneC && sceneC.targetBasePosition) {
      sceneC.targetBasePosition.x = CRATE_CAMERA_POSE.target.x;
      sceneC.targetBasePosition.y = CRATE_CAMERA_POSE.target.y;
      sceneC.targetBasePosition.z = CRATE_CAMERA_POSE.target.z;
    }

    /* Seed pose directly; the TWEEN freeze patch neutralizes startup tweens. */
    cam.position.x = CRATE_CAMERA_POSE.camera.x;
    cam.position.y = CRATE_CAMERA_POSE.camera.y;
    cam.position.z = CRATE_CAMERA_POSE.camera.z;
    tgt.position.x = CRATE_CAMERA_POSE.target.x;
    tgt.position.y = CRATE_CAMERA_POSE.target.y;
    tgt.position.z = CRATE_CAMERA_POSE.target.z;
    if (typeof cam.lookAt === "function") {
      try {
        cam.lookAt(tgt.position);
      } catch (e) {}
    }

    crateLockedPose = {
      camera: cam,
      target: tgt,
      cameraManager: ref.cameraManager,
      x: CRATE_CAMERA_POSE.camera.x,
      y: CRATE_CAMERA_POSE.camera.y,
      z: CRATE_CAMERA_POSE.camera.z,
      tx: CRATE_CAMERA_POSE.target.x,
      ty: CRATE_CAMERA_POSE.target.y,
      tz: CRATE_CAMERA_POSE.target.z,
    };
    /* Hook the library's per-frame lookAt so we pin pose immediately before render. */
    patchCameraManagerLookAt(ref.cameraManager);
  }

  function patchCameraManagerLookAt(cm) {
    if (!cm || cm.__noteionLookAtPatched) return;
    var original = cm.lookAtTarget;
    if (typeof original !== "function") return;
    cm.lookAtTarget = function () {
      try {
        if (crateLockedPose && crateLockedPose.camera && crateLockedPose.target) {
          var c = crateLockedPose.camera;
          var t = crateLockedPose.target;
          c.position.x = crateLockedPose.x;
          c.position.y = crateLockedPose.y;
          c.position.z = crateLockedPose.z;
          t.position.x = crateLockedPose.tx;
          t.position.y = crateLockedPose.ty;
          t.position.z = crateLockedPose.tz;
        }
      } catch (e) {}
      return original.apply(cm, arguments);
    };
    cm.__noteionLookAtPatched = true;
  }

  function enforceCrateCameraPose() {
    if (!crateLockedPose || !crateLockedPose.camera || !crateLockedPose.target) return;
    var cam = crateLockedPose.camera;
    var tgt = crateLockedPose.target;
    /* Pin camera. */
    cam.position.x = crateLockedPose.x;
    cam.position.y = crateLockedPose.y;
    cam.position.z = crateLockedPose.z;
    /* Pin the library's lookAt target so its per-frame camera.lookAt(target)
       cannot drift the orientation during album navigation. */
    tgt.position.x = crateLockedPose.tx;
    tgt.position.y = crateLockedPose.ty;
    tgt.position.z = crateLockedPose.tz;
    if (typeof cam.lookAt === "function") {
      try {
        cam.lookAt(tgt.position);
      } catch (e) {}
    }
    if (typeof cam.updateProjectionMatrix === "function") {
      cam.updateProjectionMatrix();
    }
    /* Also clear any scene-root drift from the mouse-move rotation (belt + suspenders). */
    var root = document.getElementById("cratedigger");
    if (root && root.__noteionSceneRoot) {
      var sr = root.__noteionSceneRoot;
      if (sr && sr.rotation) {
        sr.rotation.y = 0;
        sr.rotation.z = 0;
      }
    }
  }

  function startCrateCameraLock() {
    if (crateCameraLockRaf) return;
    function tick() {
      crateCameraLockRaf = requestAnimationFrame(tick);
      if (!crateLockedPose) {
        captureCrateCameraPose();
      }
      enforceCrateCameraPose();
    }
    crateCameraLockRaf = requestAnimationFrame(tick);
  }

  function stopCrateCameraLock() {
    if (!crateCameraLockRaf) return;
    cancelAnimationFrame(crateCameraLockRaf);
    crateCameraLockRaf = 0;
  }

  /**
   * Filter-bar "now showing" readout — reflects the record the crate is
   * currently centered on. Polls cratedigger.getSelectedRecord() on RAF; only
   * touches the DOM when the selection actually changes.
   */
  var crateNowRaf = 0;
  var crateNowLastId = -2;

  function crateSelectedRecordId(api) {
    if (!api || typeof api.getSelectedRecord !== "function") return -1;
    var rec;
    try {
      rec = api.getSelectedRecord();
    } catch (e) {
      return -1;
    }
    if (!rec) return -1;
    return typeof rec.id === "number" ? rec.id : -1;
  }

  function renderCrateNowShowing() {
    var api = window.__NOTEION_CRATEDIGGER__;
    var panel = document.getElementById("crate-filter-now");
    if (!panel) return;
    var id = crateSelectedRecordId(api);
    if (id === crateNowLastId) return;
    crateNowLastId = id;

    var rec = null;
    try {
      rec = api && typeof api.getSelectedRecord === "function" ? api.getSelectedRecord() : null;
    } catch (e) {
      rec = null;
    }
    var data = rec && rec.data;
    if (!data || id < 0) {
      panel.setAttribute("hidden", "");
      panel.classList.remove("is-visible");
      return;
    }

    var titleEl = document.getElementById("crate-filter-now-title");
    var artistEl = document.getElementById("crate-filter-now-artist");
    var posterEl = document.getElementById("crate-filter-now-poster");

    var title = String(data.title || "").trim();
    var artist = String(data.artist || "").trim();
    var poster = String(data.posterName || "").trim();
    /* Avoid duplicating "Artist · Artist" when posterName === artist. */
    if (poster && poster === artist) poster = "";

    if (titleEl) titleEl.textContent = title;
    if (artistEl) artistEl.textContent = artist;
    if (posterEl) posterEl.textContent = poster ? "@" + poster : "";
    if (!artist || !poster) {
      panel.classList.add("no-meta-sep");
    } else {
      panel.classList.remove("no-meta-sep");
    }

    panel.removeAttribute("hidden");
    requestAnimationFrame(function () {
      panel.classList.add("is-visible");
    });
  }

  function startCrateNowShowing() {
    if (crateNowRaf) return;
    function tick() {
      crateNowRaf = requestAnimationFrame(tick);
      renderCrateNowShowing();
    }
    crateNowRaf = requestAnimationFrame(tick);
  }

  function stopCrateNowShowing() {
    if (!crateNowRaf) return;
    cancelAnimationFrame(crateNowRaf);
    crateNowRaf = 0;
  }

  /**
   * Cratedigger sizes the WebGL canvas from container dimensions. If the flex
   * chain yields 0×0 on first paint, the scene is invisible until a resize.
   */
  function afterCratediggerScriptsLoaded() {
    function fixStageMinHeightIfCollapsed() {
      var wrap = document.querySelector(".crate-stage-wrap");
      var main = document.querySelector(".page-main.crate-page-main");
      if (wrap && main) {
        var rect = wrap.getBoundingClientRect();
        if (rect.height < 64) {
          var cs = getComputedStyle(main);
          var avail =
            window.innerHeight -
            (parseFloat(cs.paddingTop) || 0) -
            (parseFloat(cs.paddingBottom) || 0);
          wrap.style.minHeight = Math.max(280, avail - 4) + "px";
        }
      }
    }

    function nudgeLayout() {
      fixStageMinHeightIfCollapsed();
      window.dispatchEvent(new Event("resize"));
    }

    nudgeLayout();
    requestAnimationFrame(nudgeLayout);
    setTimeout(nudgeLayout, 0);
    setTimeout(nudgeLayout, 120);
    setTimeout(nudgeLayout, 400);

    window.addEventListener(
      "resize",
      function () {
        fixStageMinHeightIfCollapsed();
      },
      { passive: true }
    );

    setupCrateGenreAudioUi();

    initCrateRecordFilters();
    freezeCrateNavigationCameraTweens();
    captureCrateCameraPose();
    setTimeout(captureCrateCameraPose, 80);
    setTimeout(captureCrateCameraPose, 260);
    startCrateCameraLock();
    startCrateNowShowing();
    setupCrateSwipeNavigation();

    var ld = document.getElementById("cratedigger-loading");
    if (ld) {
      setTimeout(function () {
        var op = parseFloat(window.getComputedStyle(ld).opacity || "1");
        if (op > 0.08) {
          ld.classList.add("is-noteion-dismissed");
        }
      }, 6500);
    }
  }

  /**
   * Three.js texture loading often fails for data:image/svg+xml; draw to canvas as PNG.
   */
  function rasterizeDataUrlIfSvg(dataUrl) {
    return new Promise(function (resolve) {
      var s = String(dataUrl || "");
      if (!s || s.indexOf("image/svg+xml") === -1) {
        resolve(s);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || 600;
          var h = img.naturalHeight || 600;
          var c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          var ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png"));
        } catch (e) {
          resolve(s);
        }
      };
      img.onerror = function () {
        resolve(s);
      };
      img.src = s;
    });
  }

  function rasterizeRecordCovers(records) {
    return Promise.all(
      records.map(function (rec) {
        return rasterizeDataUrlIfSvg(rec.cover).then(function (url) {
          rec.cover = url;
          return rec;
        });
      })
    );
  }

  var params = new URLSearchParams(window.location.search);
  var gid = parseInt(params.get("genre") || "1", 10);
  var genres = window.SONG_SHARE_GENRES || [];

  if (!genres.length || isNaN(gid) || gid < 1 || gid > genres.length) {
    window.location.replace("home.html");
    return;
  }

  applyCrateGenreChrome(gid, genres.length);

  /** ISO strings (Supabase) and numbers → ms; invalid → NaN. */
  function toPublishedMs(v) {
    if (v == null || v === "") return NaN;
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string") {
      var ms = Date.parse(v.trim());
      return isNaN(ms) ? NaN : ms;
    }
    return NaN;
  }

  /** Milliseconds for date sorts; track index in noteionHref stays the board index. */
  function trackSongPublishedMs(t) {
    if (!t) return 0;
    var sp = toPublishedMs(t.songPublishedAt);
    if (!isNaN(sp)) return sp;
    return 0;
  }

  function trackUserPostedMs(t) {
    if (!t) return 0;
    var ca = toPublishedMs(t.createdAt);
    if (!isNaN(ca)) return ca;
    var up = toPublishedMs(t.updatedAt);
    if (!isNaN(up)) return up;
    return trackSongPublishedMs(t);
  }

  function buildRecords(genre) {
    var SP = window.SongSharePublished || {};
    var makeFallback =
      typeof SP.makeSongFallbackCoverDataUrl === "function"
        ? SP.makeSongFallbackCoverDataUrl
        : function () {
            return "";
          };

    var boardCovers = Array.isArray(genre.boardTrackCoverUrls) ? genre.boardTrackCoverUrls : [];
    var tracks = genre.tracks || [];
    var slice = tracks.slice(0, MAX_RECORDS);

    var records = [];
    for (var i = 0; i < slice.length; i++) {
      var t = slice[i];
      var cover = "";
      if (boardCovers.length && i < boardCovers.length) {
        cover = String(boardCovers[i] || "").trim();
      }
      if (!cover) {
        cover = makeFallback(t, genre.name, i);
      }

      records.push({
        title: (t && t.title) || "Untitled",
        artist: (t && (t.artist || t.displayName)) || "",
        posterName: (t && t.displayName) || "",
        cover: cover,
        hasSleeve: false,
        songPublishedAt: trackSongPublishedMs(t),
        postPublishedAt: trackUserPostedMs(t),
        publishedAt: trackUserPostedMs(t),
        noteionHref:
          "song.html?id=" + encodeURIComponent(String(gid)) + "&track=" + encodeURIComponent(String(i)),
      });
    }

    if (!records.length) {
      records.push({
        title: "No posts in this crate yet",
        artist: genre.name,
        cover: makeFallback({ title: "—" }, genre.name, "empty"),
        hasSleeve: false,
        songPublishedAt: 0,
        postPublishedAt: 0,
        publishedAt: 0,
        noteionHref: "profile.html",
      });
    }

    return records;
  }

  function sortCrateRecords(full, sortKey) {
    var list = full.slice();
    var collator =
      typeof Intl !== "undefined" && Intl.Collator
        ? new Intl.Collator(undefined, { sensitivity: "base" })
        : null;
    function cmpStr(a, b) {
      if (!collator) return String(a).localeCompare(String(b));
      return collator.compare(String(a), String(b));
    }
    list.sort(function (a, b) {
      var c;
      switch (sortKey) {
        case "song-date-asc":
          c = (a.songPublishedAt || 0) - (b.songPublishedAt || 0);
          break;
        case "song-date-desc":
          c = (b.songPublishedAt || 0) - (a.songPublishedAt || 0);
          break;
        case "post-date-asc":
          c = (a.postPublishedAt || 0) - (b.postPublishedAt || 0);
          break;
        case "post-date-desc":
          c = (b.postPublishedAt || 0) - (a.postPublishedAt || 0);
          break;
        case "date-asc":
          c = (a.postPublishedAt || a.publishedAt || 0) - (b.postPublishedAt || b.publishedAt || 0);
          break;
        case "title-desc":
          c = -cmpStr(a.title || "", b.title || "");
          break;
        case "title-asc":
          c = cmpStr(a.title || "", b.title || "");
          break;
        case "artist-desc":
          c = -cmpStr(a.artist || "", b.artist || "");
          break;
        case "artist-asc":
          c = cmpStr(a.artist || "", b.artist || "");
          break;
        case "date-desc":
          c = (b.postPublishedAt || b.publishedAt || 0) - (a.postPublishedAt || a.publishedAt || 0);
          break;
        default:
          c = (b.postPublishedAt || b.publishedAt || 0) - (a.postPublishedAt || a.publishedAt || 0);
      }
      if (c !== 0) return c;
      return (a.boardOrder || 0) - (b.boardOrder || 0);
    });
    /* Index 0 → leftmost slot in crate 0; order matches left-to-right in the row. */
    return list;
  }

  function applyCrateRecordFilter() {
    var full = window.__NOTEION_CRATE_RECORDS_FULL__;
    var api = window.__NOTEION_CRATEDIGGER__;
    if (!full || !full.length || !api || typeof api.loadRecords !== "function") return;

    var sortEl = document.getElementById("crate-filter-sort");
    var sortKey = sortEl ? sortEl.value : "date-desc";

    var out = sortCrateRecords(full, sortKey);

    window.__NOTEION_CRATE_RECORDS__ = out;
    api.loadRecords(out, false, function () {
      captureCrateCameraPose();
      window.dispatchEvent(new Event("resize"));
    });
  }

  function initCrateRecordFilters() {
    var sortEl = document.getElementById("crate-filter-sort");
    if (!sortEl) return;
    sortEl.addEventListener("change", function () {
      applyCrateRecordFilter();
    });
  }

  /**
   * Touch swipe navigation: on touch devices, swiping horizontally over the
   * 3D crate canvas flips to the previous/next record by simulating a click
   * on the existing prev/next buttons (which the cratedigger library already
   * has handlers for). Vertical swipes are ignored so the page can still
   * scroll. We attach the listener with passive:true so we don't block
   * default scrolling, but only trigger nav when the gesture is clearly
   * horizontal (|dx| > |dy| and |dx| beyond a threshold).
   */
  function setupCrateSwipeNavigation() {
    var root = document.getElementById("cratedigger");
    if (!root) return;
    var SWIPE_PX = 38;
    var SWIPE_TIME_MS = 700;
    var startX = 0;
    var startY = 0;
    var startT = 0;
    var tracking = false;

    function onStart(e) {
      var t = e.touches && e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      tracking = true;
    }

    function onEnd(e) {
      if (!tracking) return;
      tracking = false;
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      var dt = Date.now() - startT;
      if (dt > SWIPE_TIME_MS) return;
      if (Math.abs(dx) < SWIPE_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      var btn = document.getElementById(dx < 0 ? "button-next" : "button-prev");
      if (btn && typeof btn.click === "function") {
        btn.click();
      }
    }

    function onCancel() {
      tracking = false;
    }

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onCancel, { passive: true });
  }

  var remoteReady =
    window.SongShareRemoteSync && typeof window.SongShareRemoteSync.whenReady === "function"
      ? window.SongShareRemoteSync.whenReady()
      : Promise.resolve();

  remoteReady
    .then(function () {
      if (window.SongSharePublished && typeof window.SongSharePublished.applyMerge === "function") {
        window.SongSharePublished.applyMerge();
      }
      var genresNow = window.SONG_SHARE_GENRES || [];
      var genre = genresNow[gid - 1];
      if (!genre) {
        window.location.replace("home.html");
        return Promise.reject(new Error("genre missing"));
      }

      var label = document.querySelector(".js-crate-genre-label");
      if (label) {
        label.textContent = genre.name;
      }

      applyCrateGenreChrome(gid, genresNow.length);
      startCrateGenreAudio(genre);

      var records = buildRecords(genre);
      return rasterizeRecordCovers(records).then(function (done) {
        window.__NOTEION_CRATE_RECORDS_FULL__ = done.map(function (r, idx) {
          return {
            title: r.title,
            artist: r.artist,
            cover: r.cover,
            hasSleeve: !!r.hasSleeve,
            noteionHref: r.noteionHref,
            songPublishedAt: typeof r.songPublishedAt === "number" ? r.songPublishedAt : 0,
            postPublishedAt: typeof r.postPublishedAt === "number" ? r.postPublishedAt : 0,
            publishedAt: typeof r.publishedAt === "number" ? r.publishedAt : 0,
            boardOrder: idx,
          };
        });
        window.__NOTEION_CRATE_RECORDS__ = sortCrateRecords(
          window.__NOTEION_CRATE_RECORDS_FULL__,
          "date-desc"
        );
        window.__NOTEION_CRATE_N_CRATES__ = computeNbCratesForRecordCount(done.length);
      });
    })
    .then(function () {
      return appendScript("cratedigger-lib/vendor.js");
    })
    .then(function () {
      return appendScript("cratedigger-lib/index.js");
    })
    .then(function () {
      afterCratediggerScriptsLoaded();
    })
    .catch(function (err) {
      stopCrateCameraLock();
      stopCrateGenreAudio();
      if (typeof console !== "undefined" && console.error) {
        console.error("[crate-page]", err);
      }
    });

  window.addEventListener(
    "beforeunload",
    function () {
      stopCrateCameraLock();
    },
    { passive: true }
  );
})();
