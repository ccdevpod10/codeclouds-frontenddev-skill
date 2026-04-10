#!/usr/bin/env node
/**
 * build.js
 * Injects overlay image + toggle script into output/src/index.html.
 * Writes output/src/index.built.html.
 *
 * Usage: node build.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const srcFile  = path.resolve(__dirname, '../output/src/index.html');
const destFile = path.resolve(__dirname, '../output/src/index.built.html');

// Path from index.built.html to the desktop reference screenshot
const overlayImgSrc = '../reference/desktop.png';

if (!fs.existsSync(srcFile)) {
  console.error('[build] output/src/index.html not found — run downloader.py first');
  process.exit(1);
}

let html = fs.readFileSync(srcFile, 'utf8');

// ── Ensure viewport meta ───────────────────────────────────────────────────
if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, '$1\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
  } else {
    html = '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + html;
  }
}

// ── Overlay CSS ────────────────────────────────────────────────────────────
const overlayStyle = `
<style id="clone-overlay-style">
  .clone-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0.5;
    pointer-events: none;
    z-index: 9999;
    object-fit: cover;
    object-position: top left;
    display: none;
  }

  #clone-overlay-hud {
    position: fixed;
    bottom: 14px;
    right: 14px;
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    font: 600 11px/1.5 ui-monospace, monospace;
    padding: 5px 10px;
    border-radius: 6px;
    z-index: 10000;
    pointer-events: none;
    user-select: none;
    letter-spacing: 0.03em;
  }
</style>`;

// ── Overlay HTML elements ──────────────────────────────────────────────────
const overlayHtml = `
<!-- clone overlay -->
<img
  id="clone-overlay"
  class="clone-overlay"
  src="${overlayImgSrc}"
  alt="pixel reference overlay"
>
<div id="clone-overlay-hud">[O] overlay OFF &nbsp;|&nbsp; scroll = opacity</div>`;

// ── Overlay toggle script ──────────────────────────────────────────────────
const overlayScript = `
<script id="clone-overlay-script">
(function () {
  'use strict';
  var overlay  = document.getElementById('clone-overlay');
  var hud      = document.getElementById('clone-overlay-hud');
  var visible  = false;
  var opacity  = 0.5;

  function update() {
    overlay.style.display = visible ? 'block' : 'none';
    overlay.style.opacity = opacity;
    hud.textContent = '[O] overlay ' + (visible ? 'ON ' : 'OFF') +
      '  |  scroll = opacity (' + Math.round(opacity * 100) + '%)';
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'o' || e.key === 'O') {
      visible = !visible;
      update();
    }
  });

  document.addEventListener('wheel', function (e) {
    if (!visible) return;
    opacity = Math.min(1, Math.max(0.05, opacity - e.deltaY * 0.001));
    update();
  }, { passive: true });

  update();
})();
</script>`;

// ── Inject into <head> ─────────────────────────────────────────────────────
if (/<\/head>/i.test(html)) {
  html = html.replace(/<\/head>/i, `${overlayStyle}\n</head>`);
} else {
  html = overlayStyle + '\n' + html;
}

// ── Inject before </body> ─────────────────────────────────────────────────
if (/<\/body>/i.test(html)) {
  html = html.replace(/<\/body>/i, `${overlayHtml}\n${overlayScript}\n</body>`);
} else {
  html += `\n${overlayHtml}\n${overlayScript}`;
}

// ── Write output ───────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(destFile), { recursive: true });
fs.writeFileSync(destFile, html, 'utf8');
console.log(`[build] written → ${destFile}`);
console.log('[build] press O in browser to toggle overlay');
console.log('[build] scroll wheel adjusts opacity while overlay is ON');
