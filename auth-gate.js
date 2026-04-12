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
      '<h2 id="auth-gate-title" class="auth-panel-title">Noteion</h2>' +
      '<p class="auth-panel-lede">Sign in or create an account to use the site. Everything stays on this device only (demo).</p>' +
      "</div>" +
      '<div class="auth-tabs" role="tablist">' +
      '<button type="button" class="auth-tab" role="tab" aria-selected="true" aria-controls="auth-form-signin" id="auth-tab-signin">Sign in</button>' +
      '<button type="button" class="auth-tab" role="tab" aria-selected="false" aria-controls="auth-form-signup" id="auth-tab-signup">Sign up</button>' +
      "</div>" +
      '<div class="auth-form-wrap">' +
      '<form id="auth-form-signin" class="auth-panel-form" role="tabpanel">' +
      '<div class="auth-field"><label class="auth-label" for="auth-in-email">Email</label>' +
      '<input id="auth-in-email" name="email" class="auth-input" type="email" autocomplete="username" spellcheck="false" required placeholder="you@example.com" /></div>' +
      '<div class="auth-field"><label class="auth-label" for="auth-in-pass">Password</label>' +
      '<input id="auth-in-pass" name="password" class="auth-input" type="password" autocomplete="current-password" spellcheck="false" required /></div>' +
      '<button type="submit" class="auth-submit">Sign in</button>' +
      '<p class="auth-msg" data-auth-msg-in aria-live="polite"></p>' +
      "</form>" +
      '<form id="auth-form-signup" class="auth-panel-form" hidden role="tabpanel">' +
      '<div class="auth-field"><label class="auth-label" for="auth-up-name">Display name</label>' +
      '<input id="auth-up-name" name="displayName" class="auth-input" type="text" autocomplete="name" spellcheck="true" required placeholder="DJ name or nickname" /></div>' +
      '<div class="auth-field"><label class="auth-label" for="auth-up-email">Email</label>' +
      '<input id="auth-up-email" name="email" class="auth-input" type="email" autocomplete="email" spellcheck="false" required placeholder="you@example.com" /></div>' +
      '<div class="auth-field"><label class="auth-label" for="auth-up-pass">Password</label>' +
      '<input id="auth-up-pass" name="password" class="auth-input" type="password" autocomplete="new-password" spellcheck="false" required /></div>' +
      '<button type="submit" class="auth-submit">Create account</button>' +
      '<p class="auth-msg" data-auth-msg-up aria-live="polite"></p>' +
      "</form>" +
      "</div>" +
      "</div>";

    document.body.appendChild(gate);
    return gate;
  }

  function wireTabs(gate) {
    var tabs = gate.querySelectorAll(".auth-tab");
    var signInForm = gate.querySelector("#auth-form-signin");
    var signUpForm = gate.querySelector("#auth-form-signup");

    function select(which) {
      var isIn = which === "in";
      tabs[0].setAttribute("aria-selected", isIn ? "true" : "false");
      tabs[1].setAttribute("aria-selected", isIn ? "false" : "true");
      signInForm.hidden = !isIn;
      signUpForm.hidden = isIn;
    }

    tabs[0].addEventListener("click", function () { select("in"); });
    tabs[1].addEventListener("click", function () { select("up"); });
  }

  function wireForms(gate) {
    var msgIn = gate.querySelector("[data-auth-msg-in]");
    var msgUp = gate.querySelector("[data-auth-msg-up]");

    gate.querySelector("#auth-form-signin").addEventListener("submit", function (e) {
      e.preventDefault();
      showMsg(msgIn, "");
      var fd = new FormData(e.target);
      var res = window.SongShareAuth.signIn(String(fd.get("email") || ""), String(fd.get("password") || ""));
      if (res.error) showMsg(msgIn, res.error);
      else closeGate(gate);
    });

    gate.querySelector("#auth-form-signup").addEventListener("submit", function (e) {
      e.preventDefault();
      showMsg(msgUp, "");
      var fd = new FormData(e.target);
      var res = window.SongShareAuth.signUp(
        String(fd.get("email") || ""),
        String(fd.get("password") || ""),
        String(fd.get("displayName") || "")
      );
      if (res.error) showMsg(msgUp, res.error);
      else closeGate(gate);
    });
  }

  function run() {
    if (!window.SongShareAuth) return;
    if (window.SongShareAuth.getSession()) return;

    var gate = document.getElementById("songshare-auth-gate");
    if (!gate) gate = buildGate();
    if (!gate.dataset.ssWired) {
      wireTabs(gate);
      wireForms(gate);
      gate.dataset.ssWired = "1";
    }
    openGate(gate);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
