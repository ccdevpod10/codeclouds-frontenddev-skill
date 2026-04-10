#!/usr/bin/env node
/**
 * extract.js
 * Captures full page HTML and builds an asset manifest.
 * Strips tracking/analytics scripts. Keeps all functional JS.
 * Supports puppeteer (default) and playwright (CLONE_BROWSER=playwright).
 *
 * Usage: node extract.js <URL>
 * Output:
 *   <cwd>/output/reference/page.html
 *   <cwd>/output/reference/manifest.json
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const rawUrl = process.argv[2];
if (!rawUrl) { console.error('Usage: node extract.js <URL>'); process.exit(1); }

try { new URL(rawUrl); } catch {
  console.error('[extract] Invalid URL:', rawUrl);
  process.exit(1);
}

const cfg              = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/defaults.json'), 'utf8'));
const TRACKING_PATTERNS = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/tracking-patterns.json'), 'utf8'));

const log = (level, msg, extra = {}) =>
  process.stderr.write(JSON.stringify({ ts: Date.now(), level, msg, ...extra }) + '\n');

const outDir = path.join(process.cwd(), 'output', 'reference');
fs.mkdirSync(outDir, { recursive: true });

// ── Tracking helpers ───────────────────────────────────────────────────────
function isTracking(url) {
  const lower = url.toLowerCase();
  return TRACKING_PATTERNS.some(p => lower.includes(p));
}

function stripTrackingScripts(htmlStr) {
  htmlStr = htmlStr.replace(
    /<script\b([^>]*)\bsrc=["']([^"']*)["']([^>]*)\/>/gi,
    (match, pre, src) => {
      if (isTracking(src)) { log('info', 'strip tracking (self-close)', { src }); return `<!-- tracking removed: ${src} -->`; }
      return match;
    }
  );
  htmlStr = htmlStr.replace(
    /<script\b([^>]*)\bsrc=["']([^"']*)["']([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, pre, src) => {
      if (isTracking(src)) { log('info', 'strip tracking', { src }); return `<!-- tracking removed: ${src} -->`; }
      return match;
    }
  );
  return htmlStr;
}

// ── Asset helpers ──────────────────────────────────────────────────────────
function categorize(u) {
  const ext = u.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  const map = {
    css:   ['css'],
    js:    ['js', 'mjs'],
    image: ['png','jpg','jpeg','gif','webp','svg','ico','avif','bmp'],
    font:  ['woff','woff2','ttf','otf','eot'],
    media: ['mp4','webm','ogg','mp3','wav'],
  };
  for (const [type, exts] of Object.entries(map)) {
    if (exts.includes(ext)) return type;
  }
  return 'other';
}

// In-browser extraction — must be self-contained (no closures over outer scope)
function extractAssets(base) {
  const urls = new Set();
  function add(u) {
    if (!u) return;
    try { urls.add(new URL(u, base).href); } catch {}
  }
  document.querySelectorAll('link[href]').forEach(el => add(el.getAttribute('href')));
  document.querySelectorAll('script[src]').forEach(el => add(el.getAttribute('src')));
  document.querySelectorAll('img[src]').forEach(el => add(el.getAttribute('src')));
  document.querySelectorAll('img[srcset]').forEach(el => {
    (el.getAttribute('srcset') || '').split(',').forEach(part => add(part.trim().split(/\s+/)[0]));
  });
  document.querySelectorAll('source[src]').forEach(el => add(el.getAttribute('src')));
  document.querySelectorAll('source[srcset]').forEach(el => {
    (el.getAttribute('srcset') || '').split(',').forEach(part => add(part.trim().split(/\s+/)[0]));
  });
  document.querySelectorAll('video[src],audio[src]').forEach(el => add(el.getAttribute('src')));
  document.querySelectorAll('[style]').forEach(el => {
    const m = (el.getAttribute('style') || '').matchAll(/url\(["']?([^"')]+)["']?\)/g);
    for (const match of m) add(match[1]);
  });
  return [...urls];
}

// ── Puppeteer runner ───────────────────────────────────────────────────────
async function runPuppeteer() {
  const puppeteer = require('puppeteer');
  const browser   = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const networkUrls = new Set();
    page.on('response', res => { const u = res.url(); if (!u.startsWith('data:')) networkUrls.add(u); });

    log('info', 'navigating', { url: rawUrl });
    await page.goto(rawUrl, { waitUntil: 'networkidle2', timeout: cfg.timeout });

    await page.evaluate(async () => {
      await new Promise(resolve => {
        let last = 0;
        const id = setInterval(() => {
          const h = document.body.scrollHeight;
          window.scrollBy(0, window.innerHeight);
          if (h === last) { clearInterval(id); resolve(); }
          last = h;
        }, 250);
      });
      window.scrollTo(0, 0);
    });
    await new Promise(r => setTimeout(r, cfg.scrollDelay));

    const domUrls = await page.evaluate(extractAssets, rawUrl);
    const html    = await page.evaluate(() => document.documentElement.outerHTML);
    return { networkUrls: [...networkUrls], domUrls, html };
  } finally {
    await browser.close();
  }
}

// ── Playwright runner ──────────────────────────────────────────────────────
async function runPlaywright() {
  const { chromium } = require('playwright');
  const browser      = await chromium.launch({ headless: true });
  try {
    const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const networkUrls = new Set();
    page.on('response', res => { const u = res.url(); if (!u.startsWith('data:')) networkUrls.add(u); });

    log('info', 'navigating (playwright)', { url: rawUrl });
    await page.goto(rawUrl, { waitUntil: 'networkidle', timeout: cfg.timeout });

    await page.evaluate(async () => {
      await new Promise(resolve => {
        let last = 0;
        const id = setInterval(() => {
          const h = document.body.scrollHeight;
          window.scrollBy(0, window.innerHeight);
          if (h === last) { clearInterval(id); resolve(); }
          last = h;
        }, 250);
      });
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(cfg.scrollDelay);

    const domUrls = await page.evaluate(extractAssets, rawUrl);
    const html    = await page.evaluate(() => document.documentElement.outerHTML);
    return { networkUrls: [...networkUrls], domUrls, html };
  } finally {
    await browser.close();
  }
}

// ── Entry ──────────────────────────────────────────────────────────────────
(async () => {
  let result;

  if (process.env.CLONE_BROWSER === 'playwright') {
    result = await runPlaywright();
  } else {
    try {
      require.resolve('puppeteer');
      result = await runPuppeteer();
    } catch {
      log('warn', 'puppeteer not found — using playwright fallback');
      result = await runPlaywright();
    }
  }

  const { networkUrls, domUrls, html } = result;
  const filteredHtml = stripTrackingScripts(html);

  const htmlPath = path.join(outDir, 'page.html');
  fs.writeFileSync(htmlPath, filteredHtml, 'utf8');
  log('info', 'page.html saved', { sizeKB: (filteredHtml.length / 1024).toFixed(1) });

  const all    = new Set([...networkUrls, ...domUrls]);
  const assets = [];
  for (const u of all) {
    if (u.startsWith('data:') || u === rawUrl) continue;
    const type = categorize(u);
    if (type === 'js' && isTracking(u)) { log('info', 'skip tracking JS', { url: u }); continue; }
    assets.push({ url: u, type });
  }

  const manifest = { sourceUrl: rawUrl, capturedAt: new Date().toISOString(), pageHtml: 'page.html', assets };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  log('info', 'manifest.json saved', { assets: assets.length });
  log('info', 'extract complete');
})().catch(err => {
  process.stderr.write(JSON.stringify({ ts: Date.now(), level: 'error', msg: 'extract failed', error: err.message }) + '\n');
  process.exit(1);
});
