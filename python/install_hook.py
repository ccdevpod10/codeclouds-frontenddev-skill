#!/usr/bin/env python3
"""
install_hook.py
Registers caveman_hook.py as a global Claude Code UserPromptSubmit hook.
Merges the entry into ~/.claude/settings.json — preserves all existing hooks.

Usage:   python3 python/install_hook.py
Uninstall: remove the caveman entry manually from ~/.claude/settings.json
"""

import json
import sys
from pathlib import Path

SETTINGS_PATH = Path.home() / '.claude' / 'settings.json'
HOOK_SCRIPT   = Path(__file__).resolve().parent / 'caveman_hook.py'


def main() -> None:
    if not HOOK_SCRIPT.exists():
        print(f'ERROR: {HOOK_SCRIPT} not found', file=sys.stderr)
        sys.exit(1)

    # ── Read existing settings ─────────────────────────────────────────────
    if SETTINGS_PATH.exists():
        try:
            settings = json.loads(SETTINGS_PATH.read_text())
        except json.JSONDecodeError:
            print(f'ERROR: {SETTINGS_PATH} is not valid JSON', file=sys.stderr)
            sys.exit(1)
    else:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        settings = {}

    # ── Check if already registered ───────────────────────────────────────
    hook_cmd = f'python3 {HOOK_SCRIPT}'
    existing_entries = settings.get('hooks', {}).get('UserPromptSubmit', [])

    already_registered = any(
        any(h.get('command') == hook_cmd for h in entry.get('hooks', []))
        for entry in existing_entries
    )

    if already_registered:
        print(f'[caveman] already registered in {SETTINGS_PATH}')
        return

    # ── Build and merge hook entry ─────────────────────────────────────────
    new_entry = {
        'hooks': [{
            'type':    'command',
            'command': hook_cmd,
            'timeout': 5,
        }]
    }

    settings.setdefault('hooks', {}).setdefault('UserPromptSubmit', []).append(new_entry)

    # ── Write atomically (write temp → rename) ─────────────────────────────
    tmp = SETTINGS_PATH.with_suffix('.json.tmp')
    try:
        tmp.write_text(json.dumps(settings, indent=2))
        tmp.replace(SETTINGS_PATH)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        print(f'ERROR: could not write {SETTINGS_PATH}: {exc}', file=sys.stderr)
        sys.exit(1)

    print(f'[caveman] hook installed → {SETTINGS_PATH}')
    print(f'[caveman] script path:     {HOOK_SCRIPT}')
    print('[caveman] every prompt will now be caveman-ified before reaching Claude')


if __name__ == '__main__':
    main()
