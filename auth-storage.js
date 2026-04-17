/**
 * Session: local demo registry, or Supabase Auth + shared community_posts when configured.
 */
(function (global) {
  "use strict";

  var SESSION_KEY = "songShareSession";
  var USERS_KEY = "songShareUsers";
  var USERNAME_MAP_KEY = "songShareUsernameMapV1";

  function normalizeUsername(str) {
    return String(str || "")
      .trim()
      .toLowerCase();
  }

  function getUsernameMap() {
    try {
      var raw = global.localStorage.getItem(USERNAME_MAP_KEY);
      var map = raw ? JSON.parse(raw) : {};
      return map && typeof map === "object" ? map : {};
    } catch (e) {
      return {};
    }
  }

  function saveUsernameMap(map) {
    try {
      global.localStorage.setItem(USERNAME_MAP_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function registerUsernameEmail(displayName, email) {
    var uname = normalizeUsername(displayName);
    var mail = String(email || "").trim().toLowerCase();
    if (!uname || !mail) return;
    var map = getUsernameMap();
    map[uname] = mail;
    saveUsernameMap(map);
  }

  function resolveEmailFromIdentifier(identifier) {
    var raw = String(identifier || "").trim();
    if (!raw) return "";
    if (raw.indexOf("@") !== -1) return raw.toLowerCase();
    return getUsernameMap()[normalizeUsername(raw)] || "";
  }

  var cfg = global.SONGSHARE_SUPABASE || {};
  var anonKey = String(
    (cfg.anonKey != null && cfg.anonKey) || global.SONGSHARE_SUPABASE_ANON_KEY || ""
  ).trim();

  /** UMD builds may expose createClient on the namespace or under .default */
  function resolveCreateClient() {
    var s = global.supabase;
    if (!s) return null;
    if (typeof s.createClient === "function") {
      return s.createClient.bind(s);
    }
    var d = s.default;
    if (d && typeof d.createClient === "function") {
      return d.createClient.bind(d);
    }
    return null;
  }

  var createClientFn = resolveCreateClient();

  var sb =
    cfg.url &&
    anonKey &&
    createClientFn
      ? createClientFn(cfg.url, anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: global.localStorage,
          },
        })
      : null;

  if (sb) {
    global.songShareSupabaseClient = sb;
  }

  if (cfg.url && !anonKey && typeof console !== "undefined" && console.warn) {
    console.warn(
      "[Noteion] Supabase project URL is set but the anon key is missing. " +
        "Add it to supabase-config.js, or set window.SONGSHARE_SUPABASE_ANON_KEY before this script. " +
        "Dashboard: Project Settings → API → anon public (JWT starting with eyJ)."
    );
  }

  if (cfg.url && anonKey && !sb && typeof console !== "undefined" && console.error) {
    console.error(
      "[Noteion] Supabase URL and anon key are set but createClient failed. " +
        "Load https://cdn.jsdelivr.net/npm/@supabase/supabase-js (UMD) before auth-storage.js, or check the browser console for script errors."
    );
  }

  if (!sb) {
    function getUsers() {
      try {
        var raw = global.localStorage.getItem(USERS_KEY);
        var u = raw ? JSON.parse(raw) : [];
        return Array.isArray(u) ? u : [];
      } catch (e) {
        return [];
      }
    }

    function saveUsers(users) {
      global.localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    function setSession(s) {
      global.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    }

    function getSession() {
      try {
        var raw = global.localStorage.getItem(SESSION_KEY);
        var s = raw ? JSON.parse(raw) : null;
        if (s && s.userId && s.email) return s;
        return null;
      } catch (e) {
        return null;
      }
    }

    function signOut() {
      global.localStorage.removeItem(SESSION_KEY);
      return Promise.resolve();
    }

    function signUp(email, password, displayName) {
      email = (email || "").trim();
      displayName = (displayName || "").trim();
      if (!email || !password) return Promise.resolve({ error: "Email and password are required." });
      if (!displayName) return Promise.resolve({ error: "Display name is required." });
      if (password.length < 4) return Promise.resolve({ error: "Use a password with at least 4 characters." });

      var users = getUsers();
      var lower = email.toLowerCase();
      if (users.some(function (x) {
        return String(x.email).toLowerCase() === lower;
      })) {
        return Promise.resolve({ error: "An account with that email already exists. Sign in instead." });
      }

      var id = "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      users.push({
        id: id,
        email: email,
        password: password,
        displayName: displayName,
      });
      saveUsers(users);
      registerUsernameEmail(displayName, email);
      setSession({ userId: id, email: email, displayName: displayName });
      return Promise.resolve({ ok: true });
    }

    function signIn(identifier, password) {
      identifier = (identifier || "").trim();
      if (!identifier || !password) return Promise.resolve({ error: "Email/username and password are required." });

      var users = getUsers();
      var lower = resolveEmailFromIdentifier(identifier);
      if (!lower) {
        var normalizedIdentifier = normalizeUsername(identifier);
        var byName = users.find(function (x) {
          return normalizeUsername(x.displayName || "") === normalizedIdentifier;
        });
        if (byName) lower = String(byName.email || "").toLowerCase();
      }
      var u = users.find(function (x) {
        return String(x.email).toLowerCase() === lower && x.password === password;
      });
      if (!u) return Promise.resolve({ error: "Invalid email/username or password." });

      setSession({
        userId: u.id,
        email: u.email,
        displayName: u.displayName || u.email.split("@")[0],
      });
      registerUsernameEmail(u.displayName || "", u.email || "");
      return Promise.resolve({ ok: true });
    }

    global.SongShareAuth = {
      getSession: getSession,
      signUp: signUp,
      signIn: signIn,
      signOut: signOut,
      whenReady: function () {
        return Promise.resolve();
      },
    };
    return;
  }

  var sessionCache = null;
  var readyPromise = null;

  function mapSession(sbSession) {
    if (!sbSession || !sbSession.user) return null;
    var u = sbSession.user;
    var meta = u.user_metadata || {};
    return {
      userId: u.id,
      email: u.email || "",
      displayName:
        meta.display_name ||
        meta.full_name ||
        (u.email ? u.email.split("@")[0] : "Member"),
    };
  }

  function setCache(sbSession) {
    sessionCache = mapSession(sbSession);
    if (sessionCache && sessionCache.displayName && sessionCache.email) {
      registerUsernameEmail(sessionCache.displayName, sessionCache.email);
    }
  }

  readyPromise = sb.auth.getSession().then(function (res) {
    setCache(res.data.session);
    if (sessionCache) {
      global.dispatchEvent(new CustomEvent("songshare:authed"));
    }
  });

  sb.auth.onAuthStateChange(function (event, sbSession) {
    setCache(sbSession);
  });

  /** Where Supabase should send users after they click the email confirmation link (must match Redirect URLs in the dashboard). */
  function emailRedirectToAfterConfirm() {
    try {
      var loc = global.location;
      if (!loc || !loc.href || loc.protocol === "file:") return undefined;
      return new URL("home.html", loc.href).href;
    } catch (e) {
      return undefined;
    }
  }

  global.SongShareAuth = {
    getSession: function () {
      return sessionCache;
    },
    whenReady: function () {
      return readyPromise || Promise.resolve();
    },
    signUp: function (email, password, displayName) {
      email = (email || "").trim();
      displayName = (displayName || "").trim();
      if (!email || !password) return Promise.resolve({ error: "Email and password are required." });
      if (!displayName) return Promise.resolve({ error: "Display name is required." });
      if (password.length < 6) {
        return Promise.resolve({ error: "Use a password with at least 6 characters (Supabase policy)." });
      }
      var redirect = emailRedirectToAfterConfirm();
      var signUpOpts = {
        email: email,
        password: password,
        options: {
          data: { display_name: displayName },
        },
      };
      if (redirect) {
        signUpOpts.options.emailRedirectTo = redirect;
      }
      registerUsernameEmail(displayName, email);
      return sb.auth.signUp(signUpOpts).then(function (res) {
        if (res.error) return { error: res.error.message };
        if (!res.data.session) {
          var hint =
            "Check your email to confirm your account, then sign in.";
          if (redirect && typeof console !== "undefined" && console.info) {
            console.info(
              "[Noteion] Confirmation redirect URL (add to Supabase → Authentication → URL Configuration → Redirect URLs if the link fails):",
              redirect
            );
          }
          if (global.location && global.location.protocol === "file:") {
            hint +=
              " Open the site over http://localhost (Live Server, etc.), not file:// — or turn off “Confirm email” in Supabase for testing.";
          } else if (redirect) {
            hint +=
              " If the link errors, add " + redirect + " to Redirect URLs in the Supabase dashboard (Authentication → URL Configuration).";
          }
          return {
            ok: true,
            message: hint,
          };
        }
        return { ok: true };
      });
    },
    signIn: function (identifier, password) {
      identifier = (identifier || "").trim();
      if (!identifier || !password) return Promise.resolve({ error: "Email/username and password are required." });
      var email = resolveEmailFromIdentifier(identifier);
      if (!email && identifier.indexOf("@") === -1) {
        return Promise.resolve({
          error:
            "Unknown username on this device. Sign in once with email, then username sign-in will work here.",
        });
      }
      if (!email) email = identifier.toLowerCase();
      return sb.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) return { error: res.error.message };
        var sess = res.data && res.data.session ? mapSession(res.data.session) : null;
        if (sess && sess.displayName && sess.email) {
          registerUsernameEmail(sess.displayName, sess.email);
        }
        return { ok: true };
      });
    },
    signOut: function () {
      return sb.auth.signOut().then(function () {
        sessionCache = null;
      });
    },
  };
})(window);
