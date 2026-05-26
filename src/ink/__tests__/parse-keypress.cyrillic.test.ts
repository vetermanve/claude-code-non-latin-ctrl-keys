import { describe, expect, it } from 'vitest'
import { parseKeypress } from '../parse-keypress.js'

/**
 * Regression tests for ctrl+<letter> bindings on non-Latin keyboard layouts.
 *
 * Background: with kitty progressive-flags 5 (= disambiguate | report-alternate-keys)
 * the terminal sends `codepoint:shifted:base-layout-key;modifier u`, where the
 * base-layout-key is the US-layout keycode of the physical key. The parser
 * uses that field for ctrl/super combos so ctrl+c works whether the user
 * holds Cyrillic с, Greek ψ, Hebrew ב, etc.
 *
 * Plain / shift typing is unaffected — we keep the raw codepoint so the
 * user's actual character (Б, ñ, …) reaches text input.
 */

describe('CSI u — non-Latin keyboard layouts', () => {
  it('ctrl+c on Russian layout uses base-layout-key', () => {
    // U+0441 = Cyrillic 'с', U+0063 (99) = ASCII 'c', modifier 5 = ctrl+shift,
    // but kitty emits modifier 5 for ctrl alone here because Cyrillic 'с' is
    // already the "shifted" codepoint vs. the base US 'c'. Real terminals
    // emit modifier 5 only when shift is actually held. Use modifier 5 here
    // to mirror the observed sequence; both must end up with ctrl=true and
    // the layout-independent name 'c'.
    const k = parseKeypress('\x1b[1089:1089:99;5u')
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.name).toBe('c')
    expect(k.ctrl).toBe(true)
  })

  it('ctrl+e on Russian layout', () => {
    // 1091 = у (Cyrillic), base 101 = ASCII 'e', modifier 5 = ctrl
    const k = parseKeypress('\x1b[1091:1091:101;5u')
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.name).toBe('e')
    expect(k.ctrl).toBe(true)
  })

  it('ctrl+v on Greek layout', () => {
    // 969 = ω (Greek small omega), base 118 = ASCII 'v', modifier 5 = ctrl
    const k = parseKeypress('\x1b[969:969:118;5u')
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.name).toBe('v')
    expect(k.ctrl).toBe(true)
  })

  it('shift+Б (text typing) keeps the Cyrillic codepoint', () => {
    // 1041 = Б (Cyrillic capital Be), modifier 2 = shift, no ctrl.
    // We DO want the actual letter to reach text input, so name must not
    // be remapped to ASCII 'B' even though base-layout-key would be 66.
    const k = parseKeypress('\x1b[1041:1041:66;2u')
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.shift).toBe(true)
    expect(k.ctrl).toBe(false)
    // For text typing, the matcher fallback (input + getKeyName) sees the
    // raw character in `sequence` and the upstream input pipeline forwards
    // the actual Cyrillic character. We assert ctrl/super stayed off and
    // the matcher will not pretend this was a Latin 'b'.
    expect(k.name).not.toBe('b')
  })

  it('legacy kitty without alternate-keys still parses (backward compat)', () => {
    // Terminal that only honours bit 0 sends the old form: `keycode;mod u`.
    // Group 3 is undefined → matcher falls back to the raw codepoint.
    const k = parseKeypress('\x1b[99;5u')
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.name).toBe('c')
    expect(k.ctrl).toBe(true)
  })

  it('shift+enter still maps to return (no regression)', () => {
    const k = parseKeypress('\x1b[13;2u')
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.name).toBe('return')
    expect(k.shift).toBe(true)
  })

  it('escape with no modifiers still maps (no regression)', () => {
    const k = parseKeypress('\x1b[27u')
    expect(k.kind).toBe('key')
    if (k.kind !== 'key') return
    expect(k.name).toBe('escape')
    expect(k.ctrl).toBe(false)
    expect(k.shift).toBe(false)
  })
})
