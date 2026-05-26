// Snippet — two changed blocks from ink/parse-keypress.ts.

// 1) Extend the CSI u regex to capture the base-layout-key. ----------------
//
// BEFORE (line ~23):
// const CSI_U_RE = /^\x1b\[(\d+)(?:;(\d+))?u/
//
// AFTER:

/**
 * Kitty keyboard protocol — CSI u event:
 *
 *   ESC [ codepoint [: shifted [: base-layout-key]] [; modifier [: event-type] [; text-as-codepoints]] u
 *
 * Group layout:
 *   match[1] = codepoint           (Unicode of the produced character)
 *   match[2] = shifted             (Unicode after applying shift, unused)
 *   match[3] = base-layout-key     (US-layout keycode of the physical key)
 *   match[4] = modifier            (Kitty modifier bitmask + 1)
 *
 * The `:event-type` after modifier and the `;text-as-codepoints` tail are
 * consumed but discarded — we never asked the terminal to send them (we set
 * progressive-flags=5, which only enables bit 0 + bit 2). They're allowed
 * here defensively so a terminal that always sends them is still parsed.
 */
export const CSI_U_RE =
  /^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+)(?::\d+)?(?:;[\d:]+)?)?u/


// 2) Use base-layout-key for ctrl/super combos in the CSI u branch. --------
//
// BEFORE (line ~633):
// if ((match = CSI_U_RE.exec(s))) {
//   const codepoint = parseInt(match[1]!, 10)
//   const modifier = match[2] ? parseInt(match[2], 10) : 1
//   const mods = decodeModifier(modifier)
//   const name = keycodeToName(codepoint)
//   return { kind: 'key', name, fn: false, ctrl: mods.ctrl, ... }
// }
//
// AFTER:

// (inside parseKeypress, after the regex match)
//   const codepoint     = parseInt(match[1]!, 10)
//   const baseLayoutKey = match[3] !== undefined ? parseInt(match[3], 10) : undefined
//   const modifier      = match[4] !== undefined ? parseInt(match[4], 10) : 1
//   const mods          = decodeModifier(modifier)
//
//   // Modifier-combo bindings (ctrl+c, super+v, ...) MUST be layout-independent
//   //   → use the physical (US) base-layout-key when the terminal provides it.
//   // Plain / shift typing (Б, ñ, ü, ...) MUST produce the actual character
//   //   → keep the raw codepoint so text input still receives the user's letter.
//   const useBaseKey =
//     (mods.ctrl || mods.super) && baseLayoutKey !== undefined
//   const name = keycodeToName(useBaseKey ? baseLayoutKey! : codepoint)
//
//   return {
//     kind: 'key',
//     name,
//     fn: false,
//     ctrl: mods.ctrl,
//     meta: mods.meta,
//     shift: mods.shift,
//     option: false,
//     super: mods.super,
//     sequence: s,
//     raw: s,
//     isPasted: false,
//   }
