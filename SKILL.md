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

Run `node scripts/capture.js <URL>` to open the URL in headless Chromium, capture a full-page desktop screenshot at 1440px viewport and a mobile screenshot at 375px viewport, and save both to `output/reference/`.

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

Run `node scripts/extract.js <URL>` to capture the full serialized HTML, enumerate all external CSS, JS, image, and font URLs, and write the asset manifest.

```bash
node scripts/extract.js "https://example.com"
```

Expected output:
```
output/reference/page.html
output/reference/manifest.json
```

If command fails: read the error, check browser lib, retry.

---

### STEP 3 — Download all assets

Run `python3 python/downloader.py output/reference/manifest.json` to download every asset in the manifest, organize under `output/assets/`, rewrite HTML src/href paths to relative local paths, and write the rewritten HTML.

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

### STEP 4 — Build clean page

Run `node scripts/build.js` to read `output/src/index.html`, inject the overlay `<img>` and toggle script (key `O`), ensure responsive viewport meta exists, and write the final page.

```bash
node scripts/build.js
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
# Check and re-run if missing
[ -f output/reference/desktop.png ]     || node scripts/capture.js "$URL"
[ -f output/reference/mobile.png ]      || node scripts/capture.js "$URL"
[ -f output/reference/manifest.json ]   || node scripts/extract.js "$URL"
[ -f output/reference/page.html ]       || node scripts/extract.js "$URL"
[ -d output/assets ]                    || python3 python/downloader.py output/reference/manifest.json
[ -f output/src/index.html ]            || python3 python/downloader.py output/reference/manifest.json
[ -f output/src/index.built.html ]      || node scripts/build.js

echo "ALL OUTPUT FILES PRESENT"
ls -lh output/reference/ output/src/ output/assets/
```

Open `output/src/index.built.html` in a browser. Press `O` to toggle the reference overlay. Scroll while overlay is ON to adjust opacity. Align until pixel-matched.

---

## Overlay system

The overlay element loaded into the built page:

```css
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
```

Toggle with key `O`. Scroll to adjust opacity while overlay is visible.

---

## Output structure

```
output/
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
- Python downloads all assets — agent must not download manually
- Every step runs a real executable command
- If a step errors: read error → diagnose → fix → retry
- No skipping, no placeholders, no fake steps
- STEP 5 self-heals missing files by re-running the responsible step
