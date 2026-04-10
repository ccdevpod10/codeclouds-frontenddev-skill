# Design: Caveman Prompt Hook

**Date:** 2026-04-10  
**Status:** Approved, pending implementation  
**Scope:** Global Claude Code hook — transforms every user prompt to medium caveman style before LLM receives it

---

## Problem

The user wants every prompt sent to Claude to be automatically converted to "caveman style" language before it reaches the LLM. This must happen transparently — no manual invocation required — and must be robust enough that a transform failure never breaks the normal Claude workflow.

---

## Architecture

Three new Python scripts added to the existing `python/` directory:

```
python/
├── caveman_transform.py   — pure transformation logic (importable, testable, CLI-usable)
├── caveman_hook.py        — Claude Code UserPromptSubmit hook adapter
├── install_hook.py        — one-time installer: merges hook into ~/.claude/settings.json
└── downloader.py          (existing)
```

### Data Flow

```
User types prompt in Claude Code
         ↓
Claude Code fires UserPromptSubmit hook
         ↓
python/caveman_hook.py  (reads JSON from stdin)
         ↓
imports caveman_transform → transforms prompt text
         ↓
writes {"prompt": "<caveman text>"} to stdout
         ↓
Claude receives caveman-ified prompt
```

### Hook Registration (global)

Stored in `~/.claude/settings.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "python3 /absolute/path/to/python/caveman_hook.py"
      }]
    }]
  }
}
```

The absolute path is resolved at install time by `install_hook.py`, so the hook fires correctly regardless of working directory.

---

## `caveman_transform.py` — Transformation Engine

**Public interface:** `transform(text: str) -> str`

**Direct CLI:** `python3 python/caveman_transform.py "Fix the login bug"` → prints transformed text

### Transformation Pipeline (applied in order)

| Step | Rule | Input | Output |
|---|---|---|---|
| 1 | Extract + protect code blocks (backtick/fenced) | `fix \`auth.py\`` | placeholder inserted |
| 2 | Lowercase | `Fix The Bug` | `fix the bug` |
| 3 | Strip filler words | `just fix this please` | `fix this` |
| 4 | Strip articles | `fix the bug in the login` | `fix bug in login` |
| 5 | Pronoun substitution | `i need my code fixed` | `me need me code fixed` |
| 6 | Verb phrase simplification | `i would like to see` | `me want see` |
| 7 | Linking verb → `be` | `this is broken` | `this be broken` |
| 8 | Strip punctuation (keep `.` `?` `!`) | `hello, world; done:` | `hello world done` |
| 9 | Collapse whitespace | `fix  the  bug` | `fix the bug` |
| 10 | Restore protected code blocks | placeholder | `` `auth.py` `` |

**Filler words removed:** `just`, `simply`, `please`, `kindly`, `perhaps`, `basically`, `actually`, `really`

**Pronoun map:** `i ` → `me `, `my ` → `me `, `we ` → `us `, `our ` → `us `

**Verb phrase map:** `would like to` → `want`, `could you` → `you`, `need to` → `need`, `want to` → `want`, `have to` → `need`, `going to` → `want`, `i am` → `me be`, `you are` → `you be`

---

## `caveman_hook.py` — Hook Adapter

Reads Claude Code's UserPromptSubmit JSON payload from stdin, calls `caveman_transform.transform()`, outputs modified JSON.

**Fail-safe contract:**
- Malformed stdin JSON → exit 0, no output (prompt passes through unchanged)
- Transform exception → exit 0, no output (prompt passes through unchanged)
- Never exits non-zero — a broken transform must not break Claude

**Input (from Claude Code):**
```json
{"hook_event_name": "UserPromptSubmit", "prompt": "Fix the bug please", ...}
```

**Output (to Claude Code):**
```json
{"prompt": "fix bug"}
```

---

## `install_hook.py` — Hook Installer

One-time setup script. Run once after cloning:

```bash
python3 python/install_hook.py
```

What it does:
1. Resolves the absolute path of `caveman_hook.py`
2. Reads `~/.claude/settings.json` (creates `{}` if file doesn't exist)
3. Merges the `hooks.UserPromptSubmit` entry — preserves any existing hooks
4. Writes the file back atomically (write to temp, rename)
5. Prints confirmation: `[caveman] hook installed → ~/.claude/settings.json`

---

## Out of Scope

- Uninstall command (manual JSON editing to remove hook)
- Per-session toggle (always-on by design)
- NLP/ML-based transformation
- Logging transform history
