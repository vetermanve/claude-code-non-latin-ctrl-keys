// Snippet — exact lines that change in ink/termio/csi.ts around line 297.
// Drop-in replacement for the existing ENABLE_KITTY_KEYBOARD constant.

// BEFORE -----------------------------------------------------------------
//
// /**
//  * Enable Kitty keyboard protocol with basic modifier reporting
//  * CSI > 1 u - pushes mode with flags=1 (disambiguate escape codes)
//  * This makes Shift+Enter send CSI 13;2 u instead of just CR
//  */
// export const ENABLE_KITTY_KEYBOARD = csi('>1u')

// AFTER ------------------------------------------------------------------

/**
 * Enable Kitty keyboard protocol with disambiguation + alternate-keys reporting.
 * CSI > 5 u - pushes mode with flags=5 = bit 0 (disambiguate escape codes)
 * | bit 2 (report alternate keys).
 *
 * Bit 2 is what makes ctrl+c / ctrl+e / ... work on non-Latin keyboard layouts
 * (Cyrillic, Greek, Arabic, Hebrew, ...): the terminal emits the actual
 * Unicode codepoint AND the base-layout (US) keycode, e.g.
 *
 *   CSI 1089:1089:99 ; 5 u   =  ctrl+С (Cyrillic) on RU layout, base = c (99)
 *
 * Terminals are required by the spec to ignore unknown bits, so emitting `>5u`
 * is safe on older kitty / Ghostty / tmux + xterm that only honour bit 0.
 *
 * Spec: https://sw.kovidgoyal.net/kitty/keyboard-protocol/#progressive-enhancement
 */
export const ENABLE_KITTY_KEYBOARD = csi('>5u')
