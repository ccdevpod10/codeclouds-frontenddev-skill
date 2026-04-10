# Design: Production Hardening — codeclouds-frontenddev-skill

**Date:** 2026-04-10  
**Status:** Approved and implemented  
**Scope:** Internal developer tool — incremental hardening (Approach A)

---

## Problem

`codeclouds-frontenddev-skill` v1.1.1 had three categories of gaps blocking reliable daily use:

1. **Token waste** — SKILL.md was 267 lines: 55 lines of embedded bash setup logic, repetitive "MANDATORY" warnings, and CSS/JS overlay snippets duplicated from source code. `build.js` had 82 lines of inline CSS/HTML/JS template strings, bloating the file unnecessarily.

2. **Reliability gaps** — No URL validation (bad input caused cryptic Puppeteer errors). Browser processes weren't guaranteed to close on errors (try-finally missing). `manifest.json` was consumed without any structure check. All HTTP errors were retried the same way — 4xx permanent failures got 3 pointless retries.

3. **Maintainability** — Seven tracking patterns were copy-pasted in both `extract.js` and `downloader.py`. All configuration constants (timeout, concurrency, viewports, etc.) were hardcoded across 4 files in two languages with no central source of truth.

---

## Decisions

### Token reduction strategy
- **Compress SKILL.md in-place** (chosen over extracting to `setup.sh` or removing STEP 0 entirely). Reduces from 267 → ~65 lines. STEP 0 compresses to 2 commands + one fallback note. Overlay CSS/JS sections removed since they now live in `src/overlay.css` and `src/overlay.js`.
- **Extract overlay files** — `src/overlay.css` and `src/overlay.js` extracted from `build.js`. `build.js` loads them via `fs.readFileSync`. Reduces `build.js` by 82 lines of inline template strings.

### Config centralization
- **Single `config/defaults.json`** for all tunable constants. Both JS scripts and Python load from this file at startup. Env vars can override any key if needed in the future.
- **Single `config/tracking-patterns.json`** eliminates the duplicate array that was independently maintained in JS and Python.

### Error handling (no new dependencies)
- URL validation using `new URL(url)` before any browser launch — throws a clean error immediately.
- `try/finally` wrapping all browser launches guarantees `browser.close()` even on throw.
- Manifest schema validation in `downloader.py` before processing — checks `sourceUrl` and `assets` structure.
- Retry policy differentiation: HTTP 4xx → skip immediately (no retry), HTTP 5xx/network error → exponential backoff (1.5s → 3s → 6s).

### Logging (zero new dependencies)
- One-line JSON logger added to each JS script: `process.stderr.write(JSON.stringify({ts, level, msg, ...extra}) + '\n')`.
- All `console.log` replaced with structured JSON to stderr; stdout stays clean for piping.

### Python requirements
- `requirements.txt` added with pinned minor versions — eliminates manual dep tracking.

---

## Files Changed

| File | Change |
|---|---|
| `SKILL.md` | 267 → 65 lines (~75% reduction) |
| `scripts/capture.js` | URL validation, try/finally, config loading, JSON logger |
| `scripts/extract.js` | URL validation, try/finally, config + tracking patterns from JSON, JSON logger |
| `scripts/build.js` | Loads overlay CSS/JS from files; URL validation |
| `python/downloader.py` | Config + tracking patterns from JSON; manifest validation; smart retry |
| `package.json` | Added `requirements` script |
| `requirements.txt` | New — pins Python deps |
| `config/defaults.json` | New — all constants centralized |
| `config/tracking-patterns.json` | New — single source for tracking patterns |
| `src/overlay.css` | New — extracted from `build.js` |
| `src/overlay.js` | New — extracted from `build.js` |

---

## Out of Scope

- Authentication / cookie support
- Test suite
- SPA routing support
- Progress bars or cancellation
- Windows path normalization (`os.path.relpath` uses `\` on Windows)
- Pre-flight diagnostics script
