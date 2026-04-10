#!/usr/bin/env python3
"""
caveman_transform.py
Transforms text to medium-level caveman-style language.

Pipeline (applied in order):
  1.  Protect code blocks (backtick/fenced) — restored verbatim after all steps
  2.  Lowercase
  3.  Strip filler words  (just, please, simply …)
  4.  Strip articles      (the, a, an)
  5.  Pronoun substitution  (I → me, my → me, we → us …)
  6.  Verb phrase simplification  (would like to → want, need to → need …)
  7.  Linking verbs → "be"  (is/are/was/were/am → be)
  8.  Strip punctuation — keep . ? !
  9.  Collapse whitespace
  10. Restore protected code blocks

CLI:    python3 caveman_transform.py "Fix the login bug please"
Stdin:  echo "Fix login" | python3 caveman_transform.py
"""

import re
import sys

# ── Word/pattern lists ─────────────────────────────────────────────────────

FILLER_WORDS = [
    'just', 'simply', 'please', 'kindly', 'perhaps',
    'basically', 'actually', 'really', 'very',
]

ARTICLES = ['the', 'a', 'an']

# Order matters — longer phrases first to avoid partial matches
VERB_PHRASE_MAP = [
    (r'\bwould like to\b',  'want'),
    (r'\bwould like\b',     'want'),
    (r'\bcould you\b',      'you'),
    (r'\bneed to\b',        'need'),
    (r'\bwant to\b',        'want'),
    (r'\bhave to\b',        'need'),
    (r'\bgoing to\b',       'want'),
    (r'\bable to\b',        ''),
    (r'\bme am\b',          'me be'),
    (r'\byou are\b',        'you be'),
    (r'\bme are\b',         'me be'),
    (r'\bthey are\b',       'they be'),
    (r'\bit is\b',          'it be'),
    (r'\bthat is\b',        'that be'),
    (r'\bthis is\b',        'this be'),
]

PRONOUN_MAP = [
    (r'\bi\b',      'me'),
    (r'\bmy\b',     'me'),
    (r'\bmine\b',   'me'),
    (r'\bwe\b',     'us'),
    (r'\bour\b',    'us'),
    (r'\bours\b',   'us'),
]

LINKING_VERBS = ['am', 'is', 'are', 'was', 'were']


# ── Code protection ────────────────────────────────────────────────────────

def _protect_code(text: str) -> tuple[str, dict]:
    """Replace code spans/fenced blocks with stable placeholders."""
    placeholders: dict[str, str] = {}
    idx = 0

    def replace(m: re.Match) -> str:
        nonlocal idx
        # Use digits-only key so .lower() in step 2 never changes it
        key = f'\x00{idx}\x00'
        placeholders[key] = m.group(0)
        idx += 1
        return key

    # Fenced blocks first (``` … ```)
    text = re.sub(r'```[\s\S]*?```', replace, text)
    # Inline backtick spans (` … `)
    text = re.sub(r'`[^`\n]+`', replace, text)
    return text, placeholders


def _restore_code(text: str, placeholders: dict) -> str:
    for key, value in placeholders.items():
        text = text.replace(key, value)
    return text


# ── Core transform ─────────────────────────────────────────────────────────

def transform(text: str) -> str:
    """Return caveman-style version of *text*."""
    if not text or not text.strip():
        return text

    # Step 1 — protect code
    text, placeholders = _protect_code(text)

    # Step 2 — lowercase
    text = text.lower()

    # Step 3 — filler words
    for word in FILLER_WORDS:
        text = re.sub(r'\b' + re.escape(word) + r'\b', '', text)

    # Step 4 — articles
    for article in ARTICLES:
        text = re.sub(r'\b' + re.escape(article) + r'\b', '', text)

    # Step 5 — pronouns
    for pattern, replacement in PRONOUN_MAP:
        text = re.sub(pattern, replacement, text)

    # Step 6 — verb phrases (longer first to avoid partial matches)
    for pattern, replacement in VERB_PHRASE_MAP:
        text = re.sub(pattern, replacement, text)

    # Step 7 — linking verbs → "be"
    for verb in LINKING_VERBS:
        text = re.sub(r'\b' + re.escape(verb) + r'\b', 'be', text)

    # Step 8 — strip punctuation, keep . ? !
    text = re.sub(r'[,;:\'"()\[\]{}<>@#$%^&*+=|\\/_~-]', ' ', text)

    # Step 9 — collapse whitespace (preserve newlines between sentences)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()

    # Step 10 — restore code blocks
    text = _restore_code(text, placeholders)

    return text


# ── CLI entry ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) > 1:
        print(transform(' '.join(sys.argv[1:])))
    else:
        print(transform(sys.stdin.read()))
