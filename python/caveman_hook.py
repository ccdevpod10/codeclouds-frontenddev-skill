#!/usr/bin/env python3
"""
caveman_hook.py
Claude Code UserPromptSubmit hook adapter.

Reads the JSON event payload from stdin, transforms the prompt field to
caveman-style language, and writes the modified prompt JSON to stdout.

Registered in ~/.claude/settings.json — run install_hook.py to set up.

Fail-safe contract:
  - Malformed stdin / missing fields → exit 0, no output (pass-through)
  - Transform exception             → exit 0, no output (pass-through)
  - Never exits non-zero            → a broken hook must not break Claude
"""

import json
import sys
from pathlib import Path

# Resolve sibling module regardless of working directory
sys.path.insert(0, str(Path(__file__).resolve().parent))
from caveman_transform import transform  # noqa: E402


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        return

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return  # Not valid JSON — pass through

    prompt = payload.get('prompt', '')
    if not prompt:
        return  # Nothing to transform

    try:
        result = transform(prompt)
    except Exception:
        return  # Transform failed — pass through unchanged

    sys.stdout.write(json.dumps({'prompt': result}) + '\n')


if __name__ == '__main__':
    main()
