/**
 * Supabase password recovery: user lands here from the email link with a recovery session.
 */
(function () {
  "use strict";

  function show(el, text) {
    if (el) el.textContent = text || "";
  }

  function homeHref() {
    try {
      return new URL("home.html", window.location.href).href;
    } catch (e) {
      return "home.html";
    }
  }

  function init() {
    var statusEl = document.getElementById("auth-recovery-status");
    var formEl = document.getElementById("auth-recovery-form");
    var msgEl = document.getElementById("auth-recovery-msg");
    var passEl = document.getElementById("auth-recovery-pass");
    var pass2El = document.getElementById("auth-recovery-pass2");

    var showedForm = false;
    function revealForm() {
      if (showedForm) return;
      showedForm = true;
      show(statusEl, "");
      if (formEl) formEl.removeAttribute("hidden");
    }

    var client = window.songShareSupabaseClient;
    if (!client) {
      show(
        statusEl,
        "Supabase is not configured on this page. Add your project URL and anon key in supabase-config.js, then open this link again from your hosted site."
      );
      return;
    }

    client.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") {
        revealForm();
      }
    });

    var wr = window.SongShareAuth && window.SongShareAuth.whenReady;
    Promise.resolve(typeof wr === "function" ? wr.call(window.SongShareAuth) : null)
      .then(function () {
        return client.auth.getSession();
      })
      .then(function () {
        if (showedForm) return;
        window.setTimeout(function () {
          if (!showedForm) {
            show(
              statusEl,
              "This reset link is invalid or expired. Go back to sign in and use “Forgot password?” to request a new email."
            );
          }
        }, 3500);
      })
      .catch(function () {
        show(statusEl, "Could not load authentication.");
      });

    if (formEl) {
      formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        show(msgEl, "");
        var p1 = passEl ? String(passEl.value || "") : "";
        var p2 = pass2El ? String(pass2El.value || "") : "";
        if (p1 !== p2) {
          show(msgEl, "Passwords do not match.");
          return;
        }
        var upd = window.SongShareAuth && window.SongShareAuth.updatePasswordAfterRecovery;
        Promise.resolve(
          typeof upd === "function" ? upd.call(window.SongShareAuth, p1) : { error: "Password update is not available." }
        ).then(function (res) {
          if (res.error) show(msgEl, res.error);
          else window.location.assign(homeHref());
        });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
