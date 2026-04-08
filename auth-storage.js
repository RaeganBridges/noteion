/**
 * Session + local user registry (demo only — no server, not for production secrets).
 */
(function (global) {
  "use strict";

  var SESSION_KEY = "songShareSession";
  var USERS_KEY = "songShareUsers";

  function getUsers() {
    try {
      var raw = localStorage.getItem(USERS_KEY);
      var u = raw ? JSON.parse(raw) : [];
      return Array.isArray(u) ? u : [];
    } catch (e) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function setSession(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (s && s.userId && s.email) return s;
      return null;
    } catch (e) {
      return null;
    }
  }

  function signOut() {
    localStorage.removeItem(SESSION_KEY);
  }

  function signUp(email, password, displayName) {
    email = (email || "").trim();
    displayName = (displayName || "").trim();
    if (!email || !password) return { error: "Email and password are required." };
    if (!displayName) return { error: "Display name is required." };
    if (password.length < 4) return { error: "Use a password with at least 4 characters." };

    var users = getUsers();
    var lower = email.toLowerCase();
    if (users.some(function (x) { return String(x.email).toLowerCase() === lower; })) {
      return { error: "An account with that email already exists. Sign in instead." };
    }

    var id = "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    users.push({
      id: id,
      email: email,
      password: password,
      displayName: displayName,
    });
    saveUsers(users);
    setSession({ userId: id, email: email, displayName: displayName });
    return { ok: true };
  }

  function signIn(email, password) {
    email = (email || "").trim();
    if (!email || !password) return { error: "Email and password are required." };

    var users = getUsers();
    var lower = email.toLowerCase();
    var u = users.find(function ( x ) {
      return String(x.email).toLowerCase() === lower && x.password === password;
    });
    if (!u) return { error: "Invalid email or password." };

    setSession({
      userId: u.id,
      email: u.email,
      displayName: u.displayName || u.email.split("@")[0],
    });
    return { ok: true };
  }

  global.SongShareAuth = {
    getSession: getSession,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
  };
})(window);
