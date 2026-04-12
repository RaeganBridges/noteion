/**
 * Project: wxcuipdfrohozowdhlql — keys from Supabase → Project Settings → API.
 *
 * anonKey must be the "anon" / "public" JWT (long string starting with "eyJ…"),
 * NOT the project URL. Paste it between the quotes below.
 */
window.SONGSHARE_SUPABASE = {
  url: "https://wxcuipdfrohozowdhlql.supabase.co",
  // Paste the "anon" "public" JWT here, OR set window.SONGSHARE_SUPABASE_ANON_KEY in an inline <script> before auth-storage.js (keeps secrets out of git if you prefer).
  anonKey: "",
};

(function () {
  var c = window.SONGSHARE_SUPABASE || {};
  var k = String(c.anonKey || "").trim();
  var k2 = String(window.SONGSHARE_SUPABASE_ANON_KEY || "").trim();
  if (c.url && !k && !k2 && typeof console !== "undefined" && console.warn) {
    console.warn(
      "[Noteion] Add your Supabase anon public key (Project Settings → API) to supabase-config.js or window.SONGSHARE_SUPABASE_ANON_KEY — without it, sign-in and cloud posts stay disabled."
    );
  }
  if ((k || k2).indexOf("http") === 0 && typeof console !== "undefined" && console.error) {
    console.error("[Noteion] The anon key must be a JWT (eyJ…), not a URL.");
  }
})();
