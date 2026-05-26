# `ctrl+c` (and any `ctrl+<letter>` binding) does not fire on non-Latin keyboard layouts

## Summary

When the active OS keyboard layout is non-Latin (Cyrillic, Greek, Arabic,
Hebrew, Armenian, Georgian, …), pressing **ctrl+c** inside Claude Code's
TUI does nothing. The same applies to every other `ctrl+<letter>` and
`super+<letter>` binding (ctrl+e, ctrl+v, ctrl+w, etc.). Users have to
switch their OS layout back to English just to interrupt a turn.

The root cause is in how the Kitty keyboard protocol is enabled and
parsed. Plain text typing in non-Latin scripts is unaffected, so the bug
is silent — it manifests only on modifier combos.

## Environment

- Claude Code: any 2.x build (verified against 2.1.142 and the
  `@anthropic-ai/claude-code` 2.1.150 npm artefact).
- Terminals reproduced: Ghostty, kitty, iTerm2 with kitty mode enabled,
  WezTerm. Anything that honours `CSI > N u` progressive enhancement.
- OS layouts: Russian, Ukrainian, Greek, Arabic — all reproduce.

## Reproduction

1. Open Claude Code in a kitty-protocol-aware terminal.
2. Switch the OS keyboard layout to Russian.
3. Start any conversation, then press **Ctrl+С** (с = Cyrillic 'es',
   the key physically located where Latin **c** sits on a US layout).
4. Expected: turn is interrupted, the same way ctrl+c works on the
   English layout.
5. Actual: keypress is silently dropped. The user must switch the OS
   layout to English first.

## Root cause

In `ink/termio/csi.ts`:

```ts
// CSI > 1 u — pushes mode with flags=1 (disambiguate escape codes)
export const ENABLE_KITTY_KEYBOARD = csi('>1u')
```

Only **bit 0** of the Kitty progressive-enhancement bitmask is requested.
Bit 2 — *Report alternate keys* — is what makes the terminal emit the
base-layout (US) keycode alongside the produced Unicode codepoint. Without
it, on a Russian layout the terminal can only tell the app "the user
produced U+0441 (Cyrillic с) with Ctrl held".

Then in `ink/parse-keypress.ts`:

```ts
const CSI_U_RE = /^\x1b\[(\d+)(?:;(\d+))?u/
…
const codepoint = parseInt(match[1]!, 10)
const name      = keycodeToName(codepoint)
```

`keycodeToName` returns `undefined` for any codepoint outside the printable
ASCII range (32–126), with a handful of named exceptions (Tab, Enter,
Escape, …). U+0441 → `undefined` → `Key.name` is undefined → the matcher
in `keybindings/match.ts:getKeyName` returns `null` → no binding fires.

The hardcoded interrupt in `keybindings/reservedShortcuts.ts:NON_REBINDABLE`
listens for `key.ctrl && name === 'c'`, so the same path drops it as well.

## Proposed fix

Three small changes, all backwards-compatible. Full diff and a
zero-dependency reproduction are in the companion repo:

**<https://github.com/vetermanve/claude-code-non-latin-ctrl-keys>**

### 1. Enable the alternate-keys flag (`ink/termio/csi.ts`)

```diff
-export const ENABLE_KITTY_KEYBOARD = csi('>1u')
+export const ENABLE_KITTY_KEYBOARD = csi('>5u')
```

`>5u` = bit 0 (disambiguate) | bit 2 (report alternate keys). The Kitty
spec mandates that terminals ignore unknown bits, so terminals that
don't yet implement bit 2 keep working exactly as before.

### 2. Extend `CSI_U_RE` to capture the base-layout key (`ink/parse-keypress.ts`)

```diff
-const CSI_U_RE = /^\x1b\[(\d+)(?:;(\d+))?u/
+const CSI_U_RE =
+  /^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+)(?::\d+)?(?:;[\d:]+)?)?u/
```

Captures `codepoint[:shifted[:base-layout-key]][;modifier[:event-type][;text-as-codepoints]] u`.
The new groups are all optional — legacy short-form `codepoint;mod u`
sequences still parse identically.

### 3. Prefer the base-layout key for `ctrl` / `super` combos

```diff
   if ((match = CSI_U_RE.exec(s))) {
-    const codepoint = parseInt(match[1]!, 10)
-    const modifier = match[2] ? parseInt(match[2], 10) : 1
+    const codepoint     = parseInt(match[1]!, 10)
+    const baseLayoutKey = match[3] !== undefined ? parseInt(match[3], 10) : undefined
+    const modifier      = match[4] !== undefined ? parseInt(match[4], 10) : 1
     const mods = decodeModifier(modifier)
-    const name = keycodeToName(codepoint)
+
+    // Modifier-combo bindings (ctrl+c, super+v, ...) MUST be layout-independent
+    //   -> use the physical (US) base-layout-key when the terminal provides it.
+    // Plain / shift typing (Б, ñ, ü, ...) MUST produce the actual character
+    //   -> keep the raw codepoint so text input still receives the user's letter.
+    const useBaseKey =
+      (mods.ctrl || mods.super) && baseLayoutKey !== undefined
+    const name = keycodeToName(useBaseKey ? baseLayoutKey! : codepoint)
```

That's the whole behavioural change: when ctrl or super is held and the
terminal told us which physical key was pressed, we route the binding by
physical position. Text typing (no ctrl/super) keeps the raw codepoint
so `Б`, `ñ`, `ü`, etc. continue to reach the input field unchanged.

## Why this approach

- **Local.** Three files changed (csi.ts, parse-keypress.ts, one new
  spec). No new modules, no transliteration tables, no per-layout
  configuration.
- **Layout-agnostic.** The terminal already knows which physical key
  was pressed; we just ask it. Cyrillic, Greek, Arabic, Hebrew,
  Armenian, Georgian, anything — all covered by the same code path.
- **Backwards compatible.** Older terminals that don't report alternate
  keys still emit the short CSI u form, which the extended regex parses
  exactly like before (`baseLayoutKey === undefined` → use codepoint).
- **`modifyOtherKeys` left alone.** The xterm protocol can't express
  alternate keys, but xterm-class terminals translate to base-layout on
  the X side already, so they don't suffer from this bug.
- **Aligned with the Kitty spec's intent** — the alternate-keys flag was
  added precisely for this use case
  (<https://sw.kovidgoyal.net/kitty/keyboard-protocol/#progressive-enhancement>).

## Verification

The companion repo ships a six-case Node script that runs both the
current parser and the proposed parser against fixture sequences:

```
ctrl+c (RU layout)   | broken: null                   | fixed: name='c', ctrl=true     | pass
ctrl+e (RU layout)   | broken: null                   | fixed: name='e', ctrl=true     | pass
ctrl+v (GR layout)   | broken: null                   | fixed: name='v', ctrl=true     | pass
shift+B-cyr (text)   | broken: null                   | fixed: shift=true, name!='b'   | pass
legacy kitty short   | broken: name='c', ctrl=true    | fixed: name='c', ctrl=true     | pass
shift+enter          | broken: name='return',shift=t  | fixed: name='return',shift=t   | pass
```

There's also a vitest spec (`src/ink/__tests__/parse-keypress.cyrillic.test.ts`)
ready to drop into the existing test suite.

## Files changed

- `ink/termio/csi.ts` — one line + comment.
- `ink/parse-keypress.ts` — one regex + ~10 lines in the CSI u branch.
- `__tests__/parse-keypress.cyrillic.test.ts` — new (7 cases).

Happy to open a PR if maintainers prefer this routed through review.
