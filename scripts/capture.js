#!/usr/bin/env node
/**
 * capture.js
 * Captures desktop (1440px) and mobile (375px) full-page screenshots.
 * Supports puppeteer (default) and playwright (fallback via CLONE_BROWSER=playwright).
 *
 * Usage: node capture.js <URL>
 * Output: <cwd>/output/reference/desktop.png, <cwd>/output/reference/mobile.png
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node capture.js <URL>');
  process.exit(1);
}

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const outDir = path.join(OUTPUT_DIR, 'reference');
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 375,  height: 812 },
];

// ── Scroll helper (triggers lazy-loaded content) ───────────────────────────
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

  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    console.log(`[capture] ${vp.name} @ ${vp.width}px → ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(new Function(scrollPage));
    await new Promise(r => setTimeout(r, 700));
    const dest = path.join(outDir, `${vp.name}.png`);
    await page.screenshot({ path: dest, fullPage: true });
    console.log(`[capture] saved ${dest}`);
    await page.close();
  }

  await browser.close();
}

// ── Playwright runner ──────────────────────────────────────────────────────
async function runPlaywright() {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });

  for (const vp of viewports) {
    const ctx  = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    console.log(`[capture/playwright] ${vp.name} @ ${vp.width}px → ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(new Function(scrollPage));
    await page.waitForTimeout(700);
    const dest = path.join(outDir, `${vp.name}.png`);
    await page.screenshot({ path: dest, fullPage: true });
    console.log(`[capture] saved ${dest}`);
    await ctx.close();
  }

  await browser.close();
}

// ── Entry ──────────────────────────────────────────────────────────────────
(async () => {
  const usePW = process.env.CLONE_BROWSER === 'playwright';

  if (!usePW) {
    try {
      require.resolve('puppeteer');
    } catch {
      console.warn('[capture] puppeteer not found, trying playwright');
      process.env.CLONE_BROWSER = 'playwright';
    }
  }

  try {
    if (process.env.CLONE_BROWSER === 'playwright') {
      await runPlaywright();
    } else {
      await runPuppeteer();
    }
    console.log('[capture] done');
  } catch (err) {
    console.error('[capture] error:', err.message);
    if (!usePW && process.env.CLONE_BROWSER !== 'playwright') {
      console.warn('[capture] retrying with playwright fallback...');
      process.env.CLONE_BROWSER = 'playwright';
      try {
        await runPlaywright();
        console.log('[capture] done (playwright fallback)');
      } catch (err2) {
        console.error('[capture] playwright also failed:', err2.message);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
})();
