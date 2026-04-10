#!/usr/bin/env node
/**
 * capture.js
 * Captures full-page screenshots at each configured viewport.
 * Supports puppeteer (default) and playwright (CLONE_BROWSER=playwright).
 *
 * Usage: node capture.js <URL>
 * Output: <cwd>/output/reference/{name}.png per viewport
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const url = process.argv[2];
if (!url) { console.error('Usage: node capture.js <URL>'); process.exit(1); }

try { new URL(url); } catch {
  console.error('[capture] Invalid URL:', url);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/defaults.json'), 'utf8'));
const log = (level, msg, extra = {}) =>
  process.stderr.write(JSON.stringify({ ts: Date.now(), level, msg, ...extra }) + '\n');

const outDir = path.join(process.cwd(), 'output', 'reference');
fs.mkdirSync(outDir, { recursive: true });

// Scroll to bottom then back to top to trigger lazy-loaded content
const scrollPage = /* js */ `
async function scrollFull() {
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
}
scrollFull();
`;

// ── Puppeteer runner ───────────────────────────────────────────────────────
async function runPuppeteer() {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    for (const vp of cfg.viewports) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
        log('info', `capturing ${vp.name}`, { viewport: `${vp.width}px`, url });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: cfg.timeout });
        await page.evaluate(new Function(scrollPage));
        await new Promise(r => setTimeout(r, cfg.scrollDelay));
        const dest = path.join(outDir, `${vp.name}.png`);
        await page.screenshot({ path: dest, fullPage: true });
        log('info', 'saved', { file: dest });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

// ── Playwright runner ──────────────────────────────────────────────────────
async function runPlaywright() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of cfg.viewports) {
      const ctx  = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      try {
        log('info', `capturing ${vp.name} (playwright)`, { viewport: `${vp.width}px`, url });
        await page.goto(url, { waitUntil: 'networkidle', timeout: cfg.timeout });
        await page.evaluate(new Function(scrollPage));
        await page.waitForTimeout(cfg.scrollDelay);
        const dest = path.join(outDir, `${vp.name}.png`);
        await page.screenshot({ path: dest, fullPage: true });
        log('info', 'saved', { file: dest });
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

// ── Entry ──────────────────────────────────────────────────────────────────
(async () => {
  const usePW = process.env.CLONE_BROWSER === 'playwright';

  if (!usePW) {
    try { require.resolve('puppeteer'); }
    catch { log('warn', 'puppeteer not found, switching to playwright'); process.env.CLONE_BROWSER = 'playwright'; }
  }

  try {
    if (process.env.CLONE_BROWSER === 'playwright') {
      await runPlaywright();
    } else {
      await runPuppeteer();
    }
    log('info', 'capture complete');
  } catch (err) {
    log('error', 'capture failed', { error: err.message });
    if (!usePW && process.env.CLONE_BROWSER !== 'playwright') {
      log('warn', 'retrying with playwright fallback');
      process.env.CLONE_BROWSER = 'playwright';
      try {
        await runPlaywright();
        log('info', 'capture complete (playwright fallback)');
      } catch (err2) {
        log('error', 'playwright fallback also failed', { error: err2.message });
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
})();
