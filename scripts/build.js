#!/usr/bin/env node
/**
 * build.js
 * Injects live iframe overlay + toggle script into output/src/index.html.
 * Overlay loads reference URL live (not a screenshot image).
 * Writes <cwd>/output/src/index.built.html.
 *
 * Usage: node build.js <REFERENCE_URL>
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const referenceUrl = process.argv[2];
if (!referenceUrl) {
  console.error('Usage: node build.js <REFERENCE_URL>');
  process.exit(1);
}

try { new URL(referenceUrl); } catch {
  console.error('[build] Invalid URL:', referenceUrl);
  process.exit(1);
}

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const srcFile  = path.join(OUTPUT_DIR, 'src', 'index.html');
const destFile = path.join(OUTPUT_DIR, 'src', 'index.built.html');

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

// ── Load overlay assets ────────────────────────────────────────────────────
const overlayCss = fs.readFileSync(path.join(__dirname, '../src/overlay.css'), 'utf8');
const overlayJs  = fs.readFileSync(path.join(__dirname, '../src/overlay.js'), 'utf8');

const overlayStyle = `<style id="clone-overlay-style">\n${overlayCss}</style>`;

// overlayHtml is dynamic — embeds the reference URL at build time
const overlayHtml = `
<!-- clone overlay: live iframe -->
<iframe
  id="clone-overlay"
  src="${referenceUrl}"
></iframe>
<div id="clone-overlay-hud">[O] overlay OFF</div>`;

const overlayScript = `<script id="clone-overlay-script">\n${overlayJs}</script>`;

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
console.log(`[build] overlay URL: ${referenceUrl}`);
console.log('[build] press O in browser to toggle live iframe overlay');
console.log('[build] scroll wheel adjusts opacity while overlay is ON');
