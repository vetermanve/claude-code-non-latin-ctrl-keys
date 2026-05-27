# claude-code: ctrl+c on non-Latin keyboard layouts

[![repro](https://github.com/vetermanve/claude-code-non-latin-ctrl-keys/actions/workflows/repro.yml/badge.svg)](https://github.com/vetermanve/claude-code-non-latin-ctrl-keys/actions/workflows/repro.yml)

A proposed fix for [anthropics/claude-code](https://github.com/anthropics/claude-code):
ctrl+c (and every other ctrl+letter / super+letter binding) silently breaks
when the user has a non-Latin keyboard layout active — Cyrillic (Russian,
Ukrainian, …), Greek, Arabic, Hebrew, Armenian, Georgian, etc.

`/exit` and pasting are unaffected; only ctrl-modified single letters are.

This repository contains:

- [`PATCH.diff`](PATCH.diff) — unified diff against the closed-source claude-code
  CLI sources (the layout used in the npm/native bundle: `ink/termio/csi.ts`
  and `ink/parse-keypress.ts`).
- [`src/`](src/) — per-file replacement snippets and a new vitest spec.
- [`repro/`](repro/) — a zero-dependency Node script that loads the broken
  parser and the fixed parser side-by-side and runs the six regression cases.
- [`ISSUE.md`](ISSUE.md) — the bug report / proposal text in English, ready
  to file under [anthropics/claude-code/issues/new](https://github.com/anthropics/claude-code/issues/new).

## Verify the fix locally

```sh
node repro/repro-ru-ctrl-c.mjs
```

All six cases should print `pass: YES`. The interesting rows:

| Case | Broken parser | Fixed parser |
|---|---|---|
| `ctrl+c` on RU layout (kitty alt-keys) | `null` (regex doesn't match) | `name='c', ctrl=true` |
| `ctrl+v` on Greek layout (kitty alt-keys) | `null` | `name='v', ctrl=true` |
| `shift+Б` (text typing) | `null` | `shift=true, name!='b'` |
| Legacy kitty (no alt-keys) | `name='c', ctrl=true` | `name='c', ctrl=true` |

## TL;DR of the fix

Two lines + one regex.

1. `ink/termio/csi.ts`: send Kitty progressive flags `>5u` (= bit 0
   *disambiguate escape codes* + bit 2 *report alternate keys*) instead
   of `>1u`. Terminals that don't support bit 2 are required by the spec
   to ignore unknown bits.

2. `ink/parse-keypress.ts`: extend `CSI_U_RE` to capture the optional
   `base-layout-key` group from
   `codepoint[:shifted:base-layout-key][;modifier...] u`,
   and in the CSI u branch, when `ctrl` or `super` is held and the
   terminal provided a base-layout-key, use it for the matcher.

Plain typing (no ctrl/super) keeps the raw Unicode codepoint, so the user's
actual Cyrillic letter still reaches text input. Modifier-combo bindings
get routed by physical (US) key position. One branch, six lines.

## Why now

`--continue` / `--resume` work fine on RU layouts because the carriage
return reaches the application — but as soon as the user is inside the
TUI and tries to interrupt with ctrl+C, nothing happens. They have to
switch to English layout first. Everyone who works in Cyrillic and
similar scripts hits this every session.

The fix is local, backward-compatible, has no new dependencies, and
covers Cyrillic, Greek, Arabic, Hebrew, Armenian, and any other layout
that produces non-ASCII printables — by delegating layout-awareness to
the terminal exactly as the Kitty spec recommends.
