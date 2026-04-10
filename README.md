# codeclouds-frontenddev-skill

Pixel-perfect webpage cloning skill for Claude Code.

Automates: screenshot capture → asset extraction → local download → HTML rebuild → visual overlay comparison.

---

## Install

```bash
npx skills add ./codeclouds-frontenddev-skill -a claude-code
```

Or copy directly:

```bash
cp -r ./codeclouds-frontenddev-skill ~/.claude/plugins/codeclouds-frontenddev-skill
```

---

## Trigger the skill

Use this prompt in Claude Code:

```
Use the codeclouds-frontenddev-skill to clone https://example.com pixel-perfect.
```

Claude will auto-install all dependencies (Step 0) and run all steps without prompting you.

---

## What Claude does automatically

| Step | Action |
|------|--------|
| 0 | Check + install node deps (puppeteer/fs-extra) and python deps (requests/bs4) |
| 1 | Screenshot desktop (1440px) + mobile (375px) |
| 2 | Extract full HTML + build asset manifest |
| 3 | Download all assets, rewrite HTML paths to local |
| 4 | Inject overlay system, write final page |
| 5 | Verify all files, re-run any missing step |

---

## Manual run

```bash
# Install deps
npm install
pip3 install requests beautifulsoup4 lxml

# Step 1
node scripts/capture.js "https://example.com"

# Step 2
node scripts/extract.js "https://example.com"

# Step 3
python3 python/downloader.py output/reference/manifest.json

# Step 4
node scripts/build.js
```

---

## Playwright fallback

If puppeteer's Chromium download fails:

```bash
npm install playwright
npx playwright install chromium
export CLONE_BROWSER=playwright
node scripts/capture.js "https://example.com"
```

---

## Overlay controls

Open `output/src/index.built.html` in a browser:

| Input | Action |
|-------|--------|
| `O` | Toggle reference overlay on/off |
| Scroll wheel (overlay ON) | Adjust overlay opacity |

---

## Output

```
output/
  reference/
    desktop.png        ← 1440px full-page screenshot
    mobile.png         ← 375px full-page screenshot
    manifest.json      ← all asset URLs + metadata
    page.html          ← raw captured HTML
  assets/
    css/
    images/
    fonts/
    js/
    other/
  src/
    index.html         ← HTML with local asset paths
    index.built.html   ← final page with overlay injected
```
