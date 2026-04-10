#!/usr/bin/env python3
"""
downloader.py
Downloads all assets from manifest.json, rewrites HTML paths to local relative paths.
Output is always created in the current working directory (cwd), never relative to this script.

Usage:  python3 downloader.py <manifest.json>
Output: <cwd>/output/assets/<type>/...
        <cwd>/output/src/index.html
"""

import json
import os
import re
import sys
import time
import hashlib
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup

# ── Config ────────────────────────────────────────────────────────────────────
CONCURRENCY  = 8
RETRY_LIMIT  = 3
RETRY_DELAY  = 1.5
TIMEOUT      = 20

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/122.0.0.0 Safari/537.36'
    ),
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
}

# ── Tracking patterns (strip from HTML, skip download) ────────────────────────
TRACKING_PATTERNS = [
    'googletagmanager',
    'gtag',
    'facebook.net',
    'fbevents',
    'analytics',
    'pixel',
]

def is_tracking(url: str) -> bool:
    lower = url.lower()
    return any(p in lower for p in TRACKING_PATTERNS)

# ── Paths ─────────────────────────────────────────────────────────────────────
if len(sys.argv) < 2:
    print('Usage: python3 downloader.py <manifest.json>', file=sys.stderr)
    sys.exit(1)

manifest_path = Path(sys.argv[1]).resolve()
if not manifest_path.exists():
    print(f'[downloader] manifest not found: {manifest_path}', file=sys.stderr)
    sys.exit(1)

# Output always in cwd — never relative to this script
root_dir      = Path(os.getcwd()) / 'output'
assets_dir    = root_dir / 'assets'
src_dir       = root_dir / 'src'
reference_dir = root_dir / 'reference'

assets_dir.mkdir(parents=True, exist_ok=True)
src_dir.mkdir(parents=True, exist_ok=True)

manifest   = json.loads(manifest_path.read_text())
source_url = manifest.get('sourceUrl', '')
assets     = manifest.get('assets', [])
page_html  = reference_dir / manifest.get('pageHtml', 'page.html')

session = requests.Session()
session.headers.update(HEADERS)

# ── Helpers ───────────────────────────────────────────────────────────────────
def type_dir(asset_type: str) -> Path:
    d = assets_dir / asset_type
    d.mkdir(parents=True, exist_ok=True)
    return d


def safe_dest(url: str, asset_type: str) -> Path:
    parsed = urlparse(url)
    name   = Path(parsed.path).name or ''
    name   = name.split('?')[0].split('#')[0]
    if not name:
        name = hashlib.md5(url.encode()).hexdigest()[:12]
    dest = type_dir(asset_type) / name
    # Avoid collisions from different URLs with same filename
    if dest.exists():
        url_meta = dest.with_suffix(dest.suffix + '.origin')
        if url_meta.exists() and url_meta.read_text().strip() != url:
            h    = hashlib.md5(url.encode()).hexdigest()[:6]
            dest = type_dir(asset_type) / f'{dest.stem}_{h}{dest.suffix}'
    return dest


def download_one(entry: dict) -> tuple:
    url       = entry['url']
    atype     = entry.get('type', 'other')
    dest      = safe_dest(url, atype)
    origin_f  = dest.with_suffix(dest.suffix + '.origin')

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            resp = session.get(url, timeout=TIMEOUT, stream=True)
            resp.raise_for_status()
            content = resp.content
            dest.write_bytes(content)
            origin_f.write_text(url)
            size_kb = len(content) // 1024
            return (url, str(dest), f'OK {size_kb}KB')
        except Exception as exc:
            if attempt < RETRY_LIMIT:
                time.sleep(RETRY_DELAY)
            else:
                return (url, None, f'FAILED: {exc}')


# ── Download ──────────────────────────────────────────────────────────────────
print(f'[downloader] {len(assets)} assets  (concurrency={CONCURRENCY})')
print(f'[downloader] output root: {root_dir}')

url_to_local: dict[str, str] = {}
failed: list[str] = []

with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
    futs = {pool.submit(download_one, a): a for a in assets}
    for i, fut in enumerate(as_completed(futs), 1):
        orig, local, status = fut.result()
        tag = f'[{i}/{len(assets)}]'
        if local:
            url_to_local[orig] = local
            print(f'  {tag} {status}  {Path(local).name}')
        else:
            failed.append(orig)
            print(f'  {tag} {status}  {orig[:80]}')

print(f'[downloader] {len(url_to_local)} downloaded  /  {len(failed)} failed')
if failed:
    for u in failed:
        print(f'  SKIP  {u}')

# ── Rewrite HTML ──────────────────────────────────────────────────────────────
if not page_html.exists():
    print(f'[downloader] ERROR: page.html not found at {page_html}')
    print('[downloader] run extract.js first')
    sys.exit(1)

raw_html = page_html.read_text(errors='replace')
soup     = BeautifulSoup(raw_html, 'lxml')

def rel(local_path: str) -> str:
    """Return path relative to src_dir (where index.html lives)."""
    return os.path.relpath(local_path, src_dir)


def rewrite_attr(tag, attr):
    val = tag.get(attr)
    if not val or val.startswith('data:'):
        return
    local = url_to_local.get(val)
    if local:
        tag[attr] = rel(local)


# ── Strip tracking scripts from HTML ─────────────────────────────────────────
stripped = 0
for el in soup.find_all('script', src=True):
    src = el.get('src', '')
    if is_tracking(src):
        el.decompose()
        stripped += 1
        print(f'  [strip] tracking script: {src[:80]}')

if stripped:
    print(f'[downloader] stripped {stripped} tracking script(s)')

# ── Rewrite asset paths ───────────────────────────────────────────────────────
# link[href], script[src], img[src], source[src], video[src], audio[src]
for el in soup.find_all('link', href=True):
    rewrite_attr(el, 'href')
for el in soup.find_all('script', src=True):
    rewrite_attr(el, 'src')
for el in soup.find_all(['img', 'source', 'video', 'audio'], src=True):
    rewrite_attr(el, 'src')

# img[srcset], source[srcset]
for el in soup.find_all(srcset=True):
    parts = el['srcset'].split(',')
    new_parts = []
    for part in parts:
        tokens = part.strip().split()
        if tokens:
            local = url_to_local.get(tokens[0])
            if local:
                tokens[0] = rel(local)
        new_parts.append(' '.join(tokens))
    el['srcset'] = ', '.join(new_parts)

# Inline style url() in style attributes
def rewrite_inline_style(style_str: str) -> str:
    def replacer(m):
        inner = m.group(1)
        local = url_to_local.get(inner)
        return f'url({rel(local)})' if local else m.group(0)
    return re.sub(r'url\(([^)]+)\)', replacer, style_str)

for el in soup.find_all(style=True):
    el['style'] = rewrite_inline_style(el['style'])

# <style> blocks — inline CSS url()
for el in soup.find_all('style'):
    if el.string:
        el.string = rewrite_inline_style(el.string)

# ── Rewrite JS src paths in downloaded JS files ───────────────────────────────
js_dir = assets_dir / 'js'
if js_dir.exists():
    for js_file in js_dir.glob('*.js'):
        try:
            content = js_file.read_text(errors='replace')
            changed = False
            for orig_url, local_path in url_to_local.items():
                if orig_url in content:
                    rel_path = os.path.relpath(local_path, js_file.parent)
                    content = content.replace(orig_url, rel_path)
                    changed = True
            if changed:
                js_file.write_text(content, encoding='utf-8')
        except Exception:
            pass

out_html = src_dir / 'index.html'
out_html.write_text(str(soup), encoding='utf-8')
print(f'[downloader] wrote  →  {out_html}')
print('[downloader] done — run: node scripts/build.js <REFERENCE_URL>')
