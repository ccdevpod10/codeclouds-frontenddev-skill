---
name: codeclouds-frontenddev-skill
description: Clone webpage pixel-perfect using browser automation, asset download, overlay compare
---

# codeclouds-frontenddev-skill

## When to use

- User gives a URL and wants a pixel-perfect clone
- User wants a responsive version of an existing page
- User wants to visually compare a clone against the original
- User wants to extract a site's assets, HTML, and styles locally

---

## Instructions

Agent MUST execute ALL steps below in order. No step is optional. No manual steps allowed.
If any command fails, read the error output, fix the cause, and retry before moving on.

---

### STEP 0 — Auto setup (MANDATORY)

Run these checks and installs BEFORE any other step. Do NOT ask the user. Do NOT skip.

**Check runtime availability:**

```bash
node --version || echo "MISSING:node"
npm --version  || echo "MISSING:npm"
python3 --version || echo "MISSING:python3"
```

If `node` or `npm` is missing:
- macOS: `brew install node`
- Linux: `apt-get install -y nodejs npm`

If `python3` is missing:
- macOS: `brew install python3`
- Linux: `apt-get install -y python3 python3-pip`

**Install Node dependencies:**

```bash
cd /path/to/skill-root
[ -f package.json ] || npm init -y
npm list puppeteer  2>/dev/null | grep puppeteer  || npm install puppeteer
npm list fs-extra   2>/dev/null | grep fs-extra   || npm install fs-extra
```

If `npm install puppeteer` fails (e.g. Chromium download error):

```bash
npm install playwright
```

Then set env var so scripts use playwright fallback:

```bash
export CLONE_BROWSER=playwright
```

**Install Python dependencies:**

```bash
pip3 show requests       >/dev/null 2>&1 || pip3 install requests
pip3 show beautifulsoup4 >/dev/null 2>&1 || pip3 install beautifulsoup4
pip3 show lxml           >/dev/null 2>&1 || pip3 install lxml
```

**Confirm success before continuing:**

```bash
node -e "require('puppeteer')" 2>/dev/null || node -e "require('playwright')" || (echo 'ERROR: no browser lib' && exit 1)
python3 -c "import requests, bs4" || (echo 'ERROR: python deps missing' && exit 1)
echo "STEP 0 COMPLETE"
```

---

### STEP 1 — Navigate and screenshot

Run `node scripts/capture.js <URL>` from the **project root** to open the URL in headless Chromium, capture a full-page desktop screenshot at 1440px viewport and a mobile screenshot at 375px viewport, and save both to `output/reference/` in the current working directory.

```bash
node scripts/capture.js "https://example.com"
```

Expected output:
```
output/reference/desktop.png
output/reference/mobile.png
```

If command fails: read the error, check puppeteer/playwright is installed, retry.

---

### STEP 2 — Extract page data

Run `node scripts/extract.js <URL>` from the **project root** to capture the full serialized HTML, enumerate all external CSS, JS, image, and font URLs, strip tracking/analytics scripts (GTM, Facebook Pixel, analytics), and write the asset manifest.

```bash
node scripts/extract.js "https://example.com"
```

Expected output:
```
output/reference/page.html
output/reference/manifest.json
```

Tracking scripts removed automatically:
- googletagmanager, gtag, facebook, analytics, pixel

Functional JS (UI, event handlers, interactions) is kept.

If command fails: read the error, check browser lib, retry.

---

### STEP 3 — Download all assets

Run `python3 python/downloader.py output/reference/manifest.json` from the **project root** to download every asset in the manifest (CSS, JS, images, fonts), organize under `output/assets/`, strip remaining tracking script tags from HTML, rewrite all src/href paths to relative local paths, and write the rewritten HTML.

```bash
python3 python/downloader.py output/reference/manifest.json
```

Expected output:
```
output/assets/css/
output/assets/images/
output/assets/fonts/
output/assets/js/
output/src/index.html
```

If command fails: read the error, check python deps, retry.

---

### STEP 4 — Build clean page with live overlay

Run `node scripts/build.js <REFERENCE_URL>` from the **project root** to read `output/src/index.html`, inject the live iframe overlay and toggle script (key `O`), inject scroll sync, ensure responsive viewport meta exists, and write the final page.

```bash
node scripts/build.js "https://example.com"
```

Expected output:
```
output/src/index.built.html
```

If command fails: read the error, fix, retry.

---

### STEP 5 — Verify and self-fix

Check all required output files. If any is missing, re-run the corresponding step.

```bash
URL="https://example.com"

[ -f output/reference/desktop.png ]     || node scripts/capture.js "$URL"
[ -f output/reference/mobile.png ]      || node scripts/capture.js "$URL"
[ -f output/reference/manifest.json ]   || node scripts/extract.js "$URL"
[ -f output/reference/page.html ]       || node scripts/extract.js "$URL"
[ -d output/assets ]                    || python3 python/downloader.py output/reference/manifest.json
[ -f output/src/index.html ]            || python3 python/downloader.py output/reference/manifest.json
[ -f output/src/index.built.html ]      || node scripts/build.js "$URL"

echo "ALL OUTPUT FILES PRESENT"
ls -lh output/reference/ output/src/ output/assets/
```

Open `output/src/index.built.html` in a browser. Press `O` to toggle the live reference overlay. Use scroll wheel to adjust opacity while overlay is ON. Scroll the page to sync the overlay position.

---

## Overlay system

The overlay is a **live iframe** that loads the reference URL directly — not a screenshot image.

```css
#clone-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.5;
  pointer-events: none;
  z-index: 9999;
  border: none;
  display: none;
}
```

Toggle with key `O`. Scroll wheel adjusts opacity while overlay is visible. Page scroll syncs to iframe scroll position automatically.

Scroll sync:
```js
window.addEventListener('scroll', () => {
  const iframe = document.getElementById('clone-overlay');
  iframe.contentWindow.scrollTo(window.scrollX, window.scrollY);
});
```

---

## JS filtering rules

**Removed** (tracking/analytics only):
- googletagmanager
- gtag
- facebook.net / fbevents
- analytics
- pixel

**Kept** (everything else):
- UI scripts
- Event handlers
- Interaction libraries
- All functional JavaScript

---

## Output structure

All output is created in the **current working directory** (project root where commands are run), never inside the skill directory.

```
<cwd>/output/
  reference/
    desktop.png
    mobile.png
    manifest.json
    page.html
  assets/
    css/
    images/
    fonts/
    js/
  src/
    index.html
    index.built.html
```

---

## STRICT RULES

- STEP 0 runs first — always — no exceptions
- All output goes to `process.cwd()/output` — NEVER `__dirname`
- Python downloads all assets — agent must not download manually
- Every step runs a real executable command
- If a step errors: read error → diagnose → fix → retry
- No skipping, no placeholders, no fake steps
- STEP 5 self-heals missing files by re-running the responsible step
- Overlay = live iframe (NOT screenshot image)
- Tracking JS stripped; functional JS kept
