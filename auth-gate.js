/**
 * Blocks the app until SongShareAuth.getSession() exists.
 */
(function () {
  "use strict";

  function showMsg(el, text) {
    if (!el) return;
    el.textContent = text || "";
  }

  function closeGate(gate) {
    if (!gate) return;
    gate.setAttribute("hidden", "");
    document.body.classList.remove("auth-gate-open");
    window.dispatchEvent(new CustomEvent("songshare:authed"));
  }

  function openGate(gate) {
    gate.removeAttribute("hidden");
    document.body.classList.add("auth-gate-open");
    var first = gate.querySelector(".auth-input");
    if (first) first.focus();
  }

  function buildGate() {
    var gate = document.createElement("div");
    gate.id = "songshare-auth-gate";
    gate.className = "auth-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "auth-gate-title");
    gate.innerHTML =
      '<div class="auth-panel">' +
      '<div class="auth-panel-header">' +
      '<h2 id="auth-gate-title" class="auth-panel-title">CR8DIG</h2>' +
      '<p class="auth-panel-lede">Sign in or create an account.</p>' +
      "</div>" +
      '<div class="auth-tabs" role="tablist">' +
      '<button type="button" class="auth-tab" role="tab" aria-selected="true" aria-controls="auth-form-signin" id="auth-tab-signin">Sign in</button>' +
      '<button type="button" class="auth-tab" role="tab" aria-selected="false" aria-controls="auth-form-signup" id="auth-tab-signup">Sign up</button>' +
      "</div>" +
      '<div class="auth-form-wrap">' +
      '<form id="auth-form-signin" class="auth-panel-form" role="tabpanel">' +
      '<div class="auth-field"><label class="auth-label" for="auth-in-email">Email or username</label>' +
      '<input id="auth-in-email" name="email" class="auth-input" type="text" autocomplete="username" spellcheck="false" required placeholder="you@example.com or username" /></div>' +
      '<div class="auth-field"><label class="auth-label" for="auth-in-pass">Password</label>' +
      '<input id="auth-in-pass" name="password" class="auth-input" type="password" autocomplete="current-password" spellcheck="false" required /></div>' +
      '<p class="auth-forgot-wrap"><button type="button" class="auth-text-btn" id="auth-open-reset">Forgot password?</button></p>' +
      '<button type="submit" class="auth-submit">Sign in</button>' +
      '<p class="auth-msg" data-auth-msg-in aria-live="polite"></p>' +
      "</form>" +
      '<form id="auth-form-signup" class="auth-panel-form" hidden role="tabpanel">' +
      '<div class="auth-field"><label class="auth-label" for="auth-up-name">Username</label>' +
      '<input id="auth-up-name" name="displayName" class="auth-input" type="text" autocomplete="name" spellcheck="true" required placeholder="DJ name or nickname" /></div>' +
      '<div class="auth-field"><label class="auth-label" for="auth-up-email">Email</label>' +
      '<input id="auth-up-email" name="email" class="auth-input" type="email" autocomplete="email" spellcheck="false" required placeholder="you@example.com" /></div>' +
      '<div class="auth-field"><label class="auth-label" for="auth-up-pass">Password</label>' +
      '<input id="auth-up-pass" name="password" class="auth-input" type="password" autocomplete="new-password" spellcheck="false" required /></div>' +
      '<button type="submit" class="auth-submit">Create account</button>' +
      '<p class="auth-msg" data-auth-msg-up aria-live="polite"></p>' +
      "</form>" +
      '<form id="auth-form-reset" class="auth-panel-form" hidden>' +
      '<p class="auth-reset-lede">Reset password</p>' +
      '<p class="auth-reset-hint">Enter the email on your account (or a username this browser already knows from sign-in). We’ll email you a link to choose a new password.</p>' +
      '<div class="auth-field"><label class="auth-label" for="auth-reset-id">Email or username</label>' +
      '<input id="auth-reset-id" name="identifier" class="auth-input" type="text" autocomplete="username" spellcheck="false" required placeholder="you@example.com or username" /></div>' +
      '<button type="submit" class="auth-submit">Send reset link</button>' +
      '<p class="auth-msg" data-auth-msg-reset aria-live="polite"></p>' +
      '<p class="auth-reset-back-wrap"><button type="button" class="auth-text-btn" id="auth-reset-back">Back to sign in</button></p>' +
      "</form>" +
      "</div>" +
      "</div>";

    document.body.appendChild(gate);
    return gate;
  }

  function wireGate(gate) {
    var tabs = gate.querySelectorAll(".auth-tab");
    var tabsRow = gate.querySelector(".auth-tabs");
    var signInForm = gate.querySelector("#auth-form-signin");
    var signUpForm = gate.querySelector("#auth-form-signup");
    var resetForm = gate.querySelector("#auth-form-reset");
    var msgIn = gate.querySelector("[data-auth-msg-in]");
    var msgUp = gate.querySelector("[data-auth-msg-up]");
    var msgReset = gate.querySelector("[data-auth-msg-reset]");

    function select(which) {
      gate.classList.remove("auth-gate--reset");
      if (tabsRow) tabsRow.hidden = false;
      if (resetForm) resetForm.hidden = true;
      var isIn = which === "in";
      tabs[0].setAttribute("aria-selected", isIn ? "true" : "false");
      tabs[1].setAttribute("aria-selected", isIn ? "false" : "true");
      signInForm.hidden = !isIn;
      signUpForm.hidden = isIn;
    }

    function showResetView() {
      gate.classList.add("auth-gate--reset");
      if (tabsRow) tabsRow.hidden = true;
      signInForm.hidden = true;
      signUpForm.hidden = true;
      if (resetForm) {
        resetForm.hidden = false;
        showMsg(msgReset, "");
        var first = resetForm.querySelector(".auth-input");
        if (first) first.focus();
      }
    }

    tabs[0].addEventListener("click", function () { select("in"); });
    tabs[1].addEventListener("click", function () { select("up"); });

    var openReset = gate.querySelector("#auth-open-reset");
    if (openReset) {
      openReset.addEventListener("click", function () {
        showMsg(msgIn, "");
        showResetView();
      });
    }
    var backReset = gate.querySelector("#auth-reset-back");
    if (backReset) {
      backReset.addEventListener("click", function () {
        showMsg(msgReset, "");
        select("in");
        var fe = signInForm.querySelector(".auth-input");
        if (fe) fe.focus();
      });
    }

    signInForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showMsg(msgIn, "");
      var fd = new FormData(e.target);
      Promise.resolve(
        window.SongShareAuth.signIn(String(fd.get("email") || ""), String(fd.get("password") || ""))
      ).then(function (res) {
        if (res.error) showMsg(msgIn, res.error);
        else closeGate(gate);
      });
    });

    signUpForm.addEventListener("submit", function (e) {
      e.preventDefault();
      showMsg(msgUp, "");
      var fd = new FormData(e.target);
      Promise.resolve(
        window.SongShareAuth.signUp(
          String(fd.get("email") || ""),
          String(fd.get("password") || ""),
          String(fd.get("displayName") || "")
        )
      ).then(function (res) {
        if (res.error) showMsg(msgUp, res.error);
        else if (res.message) showMsg(msgUp, res.message);
        else closeGate(gate);
      });
    });

    if (resetForm) {
      resetForm.addEventListener("submit", function (e) {
        e.preventDefault();
        showMsg(msgReset, "");
        var fd = new FormData(e.target);
        var id = String(fd.get("identifier") || "");
        var fn = window.SongShareAuth.resetPasswordForEmail;
        Promise.resolve(typeof fn === "function" ? fn.call(window.SongShareAuth, id) : { error: "Reset is not available." }).then(
          function (res) {
            if (res.error) showMsg(msgReset, res.error);
            else if (res.message) showMsg(msgReset, res.message);
          }
        );
      });
    }
  }

  function run() {
    if (!window.SongShareAuth) return;

    function maybeOpenGate() {
      if (window.SongShareAuth.getSession()) return;

      var gate = document.getElementById("songshare-auth-gate");
      if (!gate) gate = buildGate();
      if (!gate.dataset.ssWired) {
        wireGate(gate);
        gate.dataset.ssWired = "1";
      }
      openGate(gate);
    }

    var wr = window.SongShareAuth.whenReady;
    if (typeof wr === "function") {
      wr.call(window.SongShareAuth).then(maybeOpenGate).catch(maybeOpenGate);
    } else {
      maybeOpenGate();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
