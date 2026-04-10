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

Execute ALL steps in order from the **project root**. If any command fails, read the error and retry.

---

### STEP 0 — Setup (first run only)

```bash
npm install
pip3 install -r requirements.txt
```

If puppeteer's Chromium download fails: `npm install playwright && export CLONE_BROWSER=playwright`

---

### STEP 1 — Screenshot

```bash
node scripts/capture.js "<URL>"
```

Output: `output/reference/desktop.png`, `output/reference/mobile.png`

---

### STEP 2 — Extract HTML + manifest

```bash
node scripts/extract.js "<URL>"
```

Output: `output/reference/page.html`, `output/reference/manifest.json`

---

### STEP 3 — Download assets

```bash
python3 python/downloader.py output/reference/manifest.json
```

Output: `output/assets/`, `output/src/index.html`

---

### STEP 4 — Build overlay page

```bash
node scripts/build.js "<URL>"
```

Output: `output/src/index.built.html`

---

### STEP 5 — Verify and self-heal

```bash
URL="<URL>"
[ -f output/reference/desktop.png ]   || node scripts/capture.js "$URL"
[ -f output/reference/manifest.json ] || node scripts/extract.js "$URL"
[ -f output/src/index.html ]          || python3 python/downloader.py output/reference/manifest.json
[ -f output/src/index.built.html ]    || node scripts/build.js "$URL"
echo "ALL OUTPUT FILES PRESENT"
```

Open `output/src/index.built.html` in a browser. Press **O** to toggle the live reference overlay. Scroll wheel adjusts opacity.

---

## Output structure

```
output/
  reference/   desktop.png  mobile.png  manifest.json  page.html
  assets/      css/  images/  fonts/  js/
  src/         index.html  index.built.html
```

---

## STRICT RULES

- STEP 0 runs first — always
- All output goes to `process.cwd()/output` — never `__dirname`
- Tracking JS stripped automatically (GTM, GA, fbevents, pixel)
- Overlay = live iframe loaded in real-time, not a screenshot
- STEP 5 self-heals missing files by re-running the responsible step
