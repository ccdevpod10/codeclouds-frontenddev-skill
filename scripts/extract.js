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
if (!rawUrl) {
  console.error('Usage: node extract.js <URL>');
  process.exit(1);
}

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const outDir = path.join(OUTPUT_DIR, 'reference');
fs.mkdirSync(outDir, { recursive: true });

// ── Tracking patterns to strip ─────────────────────────────────────────────
const TRACKING_PATTERNS = [
  'googletagmanager',
  'gtag',
  'facebook.net',
  'fbevents',
  'analytics',
  'pixel',
];

function isTracking(url) {
  const lower = url.toLowerCase();
  return TRACKING_PATTERNS.some(p => lower.includes(p));
}

// ── Strip tracking script tags from HTML string ────────────────────────────
function stripTrackingScripts(htmlStr) {
  // Self-closing script tags with tracking src
  htmlStr = htmlStr.replace(
    /<script\b([^>]*)\bsrc=["']([^"']*)["']([^>]*)\/>/gi,
    (match, pre, src, post) => {
      if (isTracking(src)) {
        console.log(`[extract] strip tracking (self-close): ${src}`);
        return `<!-- tracking removed: ${src} -->`;
      }
      return match;
    }
  );
  // Regular script tags with tracking src
  htmlStr = htmlStr.replace(
    /<script\b([^>]*)\bsrc=["']([^"']*)["']([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, pre, src, post, body) => {
      if (isTracking(src)) {
        console.log(`[extract] strip tracking: ${src}`);
        return `<!-- tracking removed: ${src} -->`;
      }
      return match;
    }
  );
  return htmlStr;
}

// ── Helpers ────────────────────────────────────────────────────────────────
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

// ── In-browser extraction function ────────────────────────────────────────
// Injected into page context via evaluate — must be self-contained.
function extractAssets(base) {
  const urls = new Set();

  function add(u) {
    if (!u) return;
    try { urls.add(new URL(u, base).href); } catch {}
  }

  // link[href]
  document.querySelectorAll('link[href]').forEach(el => add(el.getAttribute('href')));

  // script[src]
  document.querySelectorAll('script[src]').forEach(el => add(el.getAttribute('src')));

  // img[src] + img[srcset]
  document.querySelectorAll('img[src]').forEach(el => add(el.getAttribute('src')));
  document.querySelectorAll('img[srcset]').forEach(el => {
    (el.getAttribute('srcset') || '').split(',').forEach(part => {
      add(part.trim().split(/\s+/)[0]);
    });
  });

  // source[src|srcset] (video/picture)
  document.querySelectorAll('source[src]').forEach(el => add(el.getAttribute('src')));
  document.querySelectorAll('source[srcset]').forEach(el => {
    (el.getAttribute('srcset') || '').split(',').forEach(part => {
      add(part.trim().split(/\s+/)[0]);
    });
  });

  // video[src], audio[src]
  document.querySelectorAll('video[src],audio[src]').forEach(el => add(el.getAttribute('src')));

  // Inline style url()
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
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const networkUrls = new Set();
  page.on('response', res => {
    const u = res.url();
    if (!u.startsWith('data:')) networkUrls.add(u);
  });

  console.log(`[extract] navigating → ${rawUrl}`);
  await page.goto(rawUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Scroll to trigger lazy loads
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
  await new Promise(r => setTimeout(r, 600));

  const domUrls = await page.evaluate(extractAssets, rawUrl);
  const html    = await page.evaluate(() => document.documentElement.outerHTML);

  await browser.close();
  return { networkUrls: [...networkUrls], domUrls, html };
}

// ── Playwright runner ──────────────────────────────────────────────────────
async function runPlaywright() {
  const { chromium } = require('playwright');
  const browser      = await chromium.launch({ headless: true });
  const ctx          = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page         = await ctx.newPage();

  const networkUrls = new Set();
  page.on('response', res => {
    const u = res.url();
    if (!u.startsWith('data:')) networkUrls.add(u);
  });

  console.log(`[extract/playwright] navigating → ${rawUrl}`);
  await page.goto(rawUrl, { waitUntil: 'networkidle', timeout: 60000 });

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
  await page.waitForTimeout(600);

  const domUrls = await page.evaluate(extractAssets, rawUrl);
  const html    = await page.evaluate(() => document.documentElement.outerHTML);

  await browser.close();
  return { networkUrls: [...networkUrls], domUrls, html };
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
      console.warn('[extract] puppeteer not found — using playwright fallback');
      result = await runPlaywright();
    }
  }

  const { networkUrls, domUrls, html } = result;

  // Strip tracking scripts from HTML before saving
  const filteredHtml = stripTrackingScripts(html);

  // Save filtered HTML
  const htmlPath = path.join(outDir, 'page.html');
  fs.writeFileSync(htmlPath, filteredHtml, 'utf8');
  console.log(`[extract] page.html  (${(filteredHtml.length / 1024).toFixed(1)} KB)`);

  // Merge + deduplicate all asset URLs
  const all = new Set([...networkUrls, ...domUrls]);
  const assets = [];
  for (const u of all) {
    if (u.startsWith('data:') || u === rawUrl) continue;
    const type = categorize(u);
    // Skip tracking JS from manifest — functional JS is kept
    if (type === 'js' && isTracking(u)) {
      console.log(`[extract] skip tracking JS: ${u}`);
      continue;
    }
    assets.push({ url: u, type });
  }

  const manifest = {
    sourceUrl:   rawUrl,
    capturedAt:  new Date().toISOString(),
    pageHtml:    'page.html',
    assets,
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[extract] manifest.json — ${assets.length} assets`);
  console.log('[extract] done');
})().catch(err => { console.error('[extract] error:', err.message); process.exit(1); });
