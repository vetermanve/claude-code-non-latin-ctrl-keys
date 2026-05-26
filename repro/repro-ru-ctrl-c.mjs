#!/usr/bin/env node
// Reproduces the broken vs fixed parsing of CSI u for ctrl+c on a Russian
// keyboard layout (kitty progressive enhancement protocol).
//
// Run:
//   node repro/repro-ru-ctrl-c.mjs
//
// Expected (with the patch):
//   broken parser -> ctrl=true, name=undefined   FAIL (ctrl+c binding never fires)
//   fixed  parser -> ctrl=true, name='c'         PASS
//
// No deps. Pure JS so it works regardless of the claude-code build state.

// ---- Modifier decode (identical to claude-code) -------------------------
function decodeModifier(modifier) {
  const m = modifier - 1
  return {
    shift: !!(m & 1),
    meta:  !!(m & 2),
    ctrl:  !!(m & 4),
    super: !!(m & 8),
  }
}

function keycodeToName(keycode) {
  switch (keycode) {
    case 9:   return 'tab'
    case 13:  return 'return'
    case 27:  return 'escape'
    case 32:  return 'space'
    case 127: return 'backspace'
    default:
      if (keycode >= 32 && keycode <= 126) {
        return String.fromCharCode(keycode).toLowerCase()
      }
      return undefined
  }
}

// ---- Broken (current claude-code, line 23) ------------------------------
const CSI_U_RE_BROKEN = /^\x1b\[(\d+)(?:;(\d+))?u/

function parseBroken(s) {
  const m = CSI_U_RE_BROKEN.exec(s)
  if (!m) return null
  const codepoint = parseInt(m[1], 10)
  const modifier  = m[2] ? parseInt(m[2], 10) : 1
  const mods      = decodeModifier(modifier)
  return { name: keycodeToName(codepoint), ...mods }
}

// ---- Fixed (proposed patch) --------------------------------------------
const CSI_U_RE_FIXED =
  /^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+)(?::\d+)?(?:;[\d:]+)?)?u/

function parseFixed(s) {
  const m = CSI_U_RE_FIXED.exec(s)
  if (!m) return null
  const codepoint     = parseInt(m[1], 10)
  const baseLayoutKey = m[3] !== undefined ? parseInt(m[3], 10) : undefined
  const modifier      = m[4] !== undefined ? parseInt(m[4], 10) : 1
  const mods          = decodeModifier(modifier)
  const useBaseKey    = (mods.ctrl || mods.super) && baseLayoutKey !== undefined
  return {
    name: keycodeToName(useBaseKey ? baseLayoutKey : codepoint),
    ...mods,
  }
}

// ---- Cases -------------------------------------------------------------
const cases = [
  ['ctrl+c (RU layout, kitty alt-keys)', '\x1b[1089:1089:99;5u',  { ctrl: true,  name: 'c' }],
  ['ctrl+e (RU layout, kitty alt-keys)', '\x1b[1091:1091:101;5u', { ctrl: true,  name: 'e' }],
  ['ctrl+v (GR layout, kitty alt-keys)', '\x1b[969:969:118;5u',   { ctrl: true,  name: 'v' }],
  ['shift+B-cyr (text typing)',          '\x1b[1041:1041:66;2u',  { ctrl: false, shift: true, name_not: 'b' }],
  ['legacy kitty (no alt-keys)',         '\x1b[99;5u',            { ctrl: true,  name: 'c' }],
  ['shift+enter',                        '\x1b[13;2u',            { shift: true, name: 'return' }],
]

const pad = s => s.padEnd(40)
let failed = 0
for (const [label, seq, want] of cases) {
  const a = parseBroken(seq)
  const b = parseFixed(seq)
  const ok =
    (want.ctrl  === undefined || b.ctrl  === want.ctrl)  &&
    (want.shift === undefined || b.shift === want.shift) &&
    (want.name  === undefined || b.name  === want.name)  &&
    (want.name_not === undefined || b.name !== want.name_not)
  if (!ok) failed++
  console.log(pad(label),
    '| broken:', JSON.stringify(a),
    '\n' + ' '.repeat(40),
    '| fixed: ', JSON.stringify(b),
    '\n' + ' '.repeat(40),
    '| pass:  ', ok ? 'YES' : 'NO',
    '\n')
}
process.exit(failed ? 1 : 0)
