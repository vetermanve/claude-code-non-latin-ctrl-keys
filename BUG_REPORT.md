# Bug Report — `ctrl+<letter>` bindings silently fail on non-Latin keyboard layouts

> Short version, fitted to the Claude Code Bug Report template.
> Full RFC, unified diff, and zero-dep reproduction live in this same
> repo (see [README.md](README.md), [PATCH.diff](PATCH.diff),
> [ISSUE.md](ISSUE.md), [repro/](repro/)).

---

## Preflight Checklist

- [x] I have searched existing issues and this hasn't been reported yet
- [x] This is a single bug report
- [x] I am using the latest version of Claude Code (2.1.142, also reproduced against npm `@anthropic-ai/claude-code` 2.1.150)

## What happened?

When the OS keyboard layout is non-Latin (Russian / Ukrainian / Greek /
Arabic / Hebrew / Armenian / Georgian / …), every `ctrl+<letter>` and
`super+<letter>` binding inside Claude Code's TUI silently does nothing.

The most visible symptom is **`ctrl+c` not interrupting** a turn —
users have to switch their OS layout to English just to send the
interrupt. Same applies to `ctrl+e`, `ctrl+v`, `ctrl+w`, etc.

Plain text typing in non-Latin scripts is unaffected, which is why the
bug is silent.

## Steps to reproduce

1. Use a terminal that supports the Kitty keyboard protocol — Ghostty,
   kitty, iTerm2 with kitty mode enabled, WezTerm, or modern Konsole.
2. Switch the OS keyboard layout to Russian (or any non-Latin layout).
3. Start a Claude Code session: `claude`.
4. Begin any turn, then press **Ctrl+С** (the key physically located
   where Latin **c** sits on a US layout — Cyrillic 'с', U+0441).

## Expected behavior

The turn is interrupted — same behavior as pressing **Ctrl+C** on an
English layout. `ctrl+e`, `ctrl+v`, etc. should all fire their bindings
regardless of the active OS keyboard layout.

## Actual behavior

The keypress is silently dropped. The matcher in
`keybindings/match.ts:getKeyName` returns `null`, so neither the
user-rebindable bindings nor the hardcoded interrupt in
`keybindings/reservedShortcuts.ts:NON_REBINDABLE` fire.

## Environment

- Claude Code: `2.1.142` (also tested with npm `@anthropic-ai/claude-code@2.1.150`)
- OS: macOS 14 (Darwin 24.6.0); also reproducible on Linux
- Terminals confirmed broken: Ghostty 1.2.x, kitty 0.37, iTerm2 3.6 with kitty mode, WezTerm
- OS layouts that reproduce: Russian, Ukrainian, Greek, Arabic — anything non-ASCII printable

## Root cause (one paragraph)

`ink/termio/csi.ts` enables the Kitty keyboard protocol with progressive
flags `>1u` — bit 0 only (*disambiguate escape codes*). Bit 2
(*report alternate keys*) is not requested, so on a non-Latin layout
the terminal can only report the produced Unicode codepoint
(e.g. U+0441 = Cyrillic 'с') without the US-layout base key (U+0063 = 'c').
`ink/parse-keypress.ts:keycodeToName` then returns `undefined` for any
codepoint outside printable ASCII, so `Key.name` ends up `undefined`
and no binding can match — neither user-rebindable nor the hardcoded
ctrl+c interrupt.

## Proposed fix

Three small, backward-compatible changes. Full unified diff:
[PATCH.diff](PATCH.diff). Zero-dep Node reproduction that runs the
broken parser and the fixed parser side-by-side:
[`node repro/repro-ru-ctrl-c.mjs`](repro/repro-ru-ctrl-c.mjs).

1. **`ink/termio/csi.ts`** — request the alternate-keys progressive flag.
   The Kitty spec mandates that terminals ignore unknown bits, so this
   is safe on terminals that don't yet implement bit 2.

   ```diff
   -export const ENABLE_KITTY_KEYBOARD = csi('>1u')
   +export const ENABLE_KITTY_KEYBOARD = csi('>5u')
   ```

2. **`ink/parse-keypress.ts`** — extend `CSI_U_RE` to capture the
   optional base-layout-key group. New groups are all optional, so the
   legacy short-form (`codepoint;mod u`) still parses identically.

   ```diff
   -const CSI_U_RE = /^\x1b\[(\d+)(?:;(\d+))?u/
   +const CSI_U_RE =
   +  /^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+)(?::\d+)?(?:;[\d:]+)?)?u/
   ```

3. **`ink/parse-keypress.ts`** (CSI u branch, ~line 633) — when `ctrl`
   or `super` is held and the terminal provided a base-layout-key, use
   it for the matcher. Plain typing (no ctrl/super) keeps the raw
   codepoint so the user's actual character (`Б`, `ñ`, `ü`, …) still
   reaches the input field.

   ```diff
      if ((match = CSI_U_RE.exec(s))) {
   -    const codepoint = parseInt(match[1]!, 10)
   -    const modifier = match[2] ? parseInt(match[2], 10) : 1
   +    const codepoint     = parseInt(match[1]!, 10)
   +    const baseLayoutKey = match[3] !== undefined ? parseInt(match[3], 10) : undefined
   +    const modifier      = match[4] !== undefined ? parseInt(match[4], 10) : 1
        const mods = decodeModifier(modifier)
   -    const name = keycodeToName(codepoint)
   +    const useBaseKey =
   +      (mods.ctrl || mods.super) && baseLayoutKey !== undefined
   +    const name = keycodeToName(useBaseKey ? baseLayoutKey! : codepoint)
   ```

A 7-case vitest spec covering Russian, Greek, text typing (`shift+Б`),
legacy short-form, and `shift+enter` is included in the repo at
`src/ink/__tests__/parse-keypress.cyrillic.test.ts`.

## Why this approach

- **Local** — three files, no new modules, no transliteration tables,
  no per-layout configuration.
- **Layout-agnostic** — the terminal already knows which physical key
  was pressed; we just ask it. Covers Cyrillic, Greek, Arabic, Hebrew,
  Armenian, Georgian, anything.
- **Backwards compatible** — terminals that don't implement bit 2 keep
  sending the short form, which the extended regex parses identically.
- **`modifyOtherKeys` left untouched** — xterm-class terminals already
  translate to base-layout on the X side, so they don't suffer from
  this bug.
- Aligned with the Kitty spec's intent — alternate-keys was added
  precisely for this case:
  <https://sw.kovidgoyal.net/kitty/keyboard-protocol/#progressive-enhancement>.

Companion repo with full diff, RFC write-up, and reproduction:
<https://github.com/vetermanve/claude-code-non-latin-ctrl-keys>

Happy to open a PR if that's the preferred path.
