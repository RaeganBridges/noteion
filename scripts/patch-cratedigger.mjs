/**
 * Patch vendored cratedigger bundle for Noteion:
 * - Load records from window.__NOTEION_CRATE_RECORDS__ when set
 * - No shuffle (stable track order)
 * - Asset paths relative to site root
 * - Crate wood: root-relative URL + MeshBasicMaterial (Lambert + lights read as black)
 * - Navigate via window.__NOTEION_BEGIN_POST_TRANSITION__ (crate-page: optional pause + slow fade)
 * - Fire window.__NOTEION_CRATE_NAV__() when the focused record index changes (prev/next)
 * - nbCrates from window.__NOTEION_CRATE_N_CRATES__ (crate-page.js), else 2
 * - Wheel: throttle prev/next (~130ms); grabSensitivity 7 (between stock 6 and 9)
 * - WebGL clear color from window.__NOTEION_CRATE_BG_COLOR__ (crate-page.js, genre HSL → RGB)
 * - WebGL alpha + clear alpha 0 when window.__NOTEION_CRATE_GRADIENT_BG__ so CSS gradients show behind canvas
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const target = path.join(root, "cratedigger-lib", "index.js");

let s = fs.readFileSync(target, "utf8");

const replacements = [
  [
    'sleeveMaskTexture:"images/sleeve.png"',
    'sleeveMaskTexture:"cratedigger-lib/images/sleeve.png"',
  ],
  // Dynamic crate count from window.__NOTEION_CRATE_N_CRATES__ (set in crate-page.js from post count)
  [
    "nbCrates:2,recordsPerCrate:24",
    'nbCrates:typeof window!=="undefined"&&null!=window.__NOTEION_CRATE_N_CRATES__?+window.__NOTEION_CRATE_N_CRATES__:2,recordsPerCrate:24',
  ],
  // Wood on crate mesh (assets/crate-wood.jpg → images/wood.jpg + crate-wood-inline.js data URL)
  [
    'crateTexture:"images/wood.jpg"',
    'crateTexture:"cratedigger-lib/images/wood.jpg"',
  ],
  // Lambert needs strong lights; Basic shows the wood map; color multiplies texture (warm brown tint)
  [
    "MeshLambertMaterial({map:e})",
    "MeshBasicMaterial({map:e,color:9602424})",
  ],
  // Resolve wood texture URL against the current page (avoids 404 when not served from site root)
  [
    'e=te["default"].ImageUtils.loadTexture(he["default"].crateTexture)',
    'e=te["default"].ImageUtils.loadTexture((typeof window!=="undefined"&&window.__NOTEION_CRATE_TEXTURE_URL__?window.__NOTEION_CRATE_TEXTURE_URL__:he["default"].crateTexture))',
  ],
  [
    "loadRecords(l,!0,function(){i()})",
    'loadRecords((typeof window!=="undefined"&&window.__NOTEION_CRATE_RECORDS__&&window.__NOTEION_CRATE_RECORDS__.length)?window.__NOTEION_CRATE_RECORDS__:l,!1,function(){i()})',
  ],
  [
    'onInfoPanelOpened:function(){d.classList.add("closed"),r(s["default"].getSelectedRecord())}',
    'onInfoPanelOpened:function(){var rec=s["default"].getSelectedRecord();d.classList.add("closed");if(rec)r(rec);if(rec&&rec.data&&rec.data.noteionHref){var h=rec.data.noteionHref;typeof window.__NOTEION_BEGIN_POST_TRANSITION__=="function"?window.__NOTEION_BEGIN_POST_TRANSITION__(h):setTimeout(function(){window.location.href=h},750)}}',
  ],
  [
    'function d(e){"opened"===je?u():"opening"!==je&&"closing"!==je&&(0>e?h():He=e>Ge?Ge-1:e)}function c(){',
    'function d(e){"opened"===je?u():"opening"!==je&&"closing"!==je&&(0>e?h():(He=e>Ge?Ge-1:e,typeof window!=="undefined"&&window.__NOTEION_CRATE_NAV__&&window.__NOTEION_CRATE_NAV__()))}function c(){',
  ],
  [
    'function C(e){return _(V(e)<0?"prev":"next"),!1}',
    'function C(e){var v=V(e),t=Date.now(),l=window.__NOTEION_CRATE_WHEEL_T;return l&&t-l<130?!1:(window.__NOTEION_CRATE_WHEEL_T=t,_(v<0?"prev":"next"),!1)}',
  ],
  ["grabSensitivity:6", "grabSensitivity:7"],
  // Scene clear color from crate-page.js __NOTEION_CRATE_BG_COLOR__ (homepage genre HSL → RGB)
  [
    "backgroundColor:1118481",
    'backgroundColor:typeof window!=="undefined"&&null!=window.__NOTEION_CRATE_BG_COLOR__?+window.__NOTEION_CRATE_BG_COLOR__:1118481',
  ],
  [
    "WebGLRenderer({antialias:!0})",
    'WebGLRenderer({antialias:!0,alpha:!0})',
  ],
  [
    'setClearColor(he["default"].backgroundColor,1)',
    'setClearColor(he["default"].backgroundColor,typeof window!=="undefined"&&window.__NOTEION_CRATE_GRADIENT_BG__?0:1)',
  ],
  [
    '}),s["default"].loadRecords((typeof window',
    '}),window.__NOTEION_CRATEDIGGER__=s["default"],s["default"].loadRecords((typeof window',
  ],
];

for (const [a, b] of replacements) {
  if (!s.includes(a)) {
    console.error("patch-cratedigger: pattern not found:", a.slice(0, 80));
    process.exit(1);
  }
  s = s.split(a).join(b);
}

fs.writeFileSync(target, s);
console.log("patched", target);

function writeCrateWoodDataUrl(jpegPath, inlinePath) {
  const b64 = fs.readFileSync(jpegPath);
  const payload = b64.toString("base64");
  fs.writeFileSync(
    inlinePath,
    `window.__NOTEION_CRATE_TEXTURE_URL__="data:image/jpeg;base64,${payload}";\n`
  );
}

const customWood = path.join(root, "assets", "crate-wood.jpg");
const woodOut = path.join(root, "cratedigger-lib", "images", "wood.jpg");
const inlinePath = path.join(root, "cratedigger-lib", "crate-wood-inline.js");
if (fs.existsSync(customWood)) {
  fs.copyFileSync(customWood, woodOut);
  writeCrateWoodDataUrl(customWood, inlinePath);
  console.log("crate wood texture:", woodOut, "+", inlinePath);
} else {
  console.warn("patch-cratedigger: assets/crate-wood.jpg missing; using npm wood.jpg");
  const fallback = path.join(root, "cratedigger-lib", "images", "wood.jpg");
  if (fs.existsSync(fallback)) {
    writeCrateWoodDataUrl(fallback, inlinePath);
  }
}
