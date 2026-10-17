// Names for every input code (crates/engine/src/input.rs): 0-255 Windows
// virtual keys, 256-260 mouse buttons, 261-264 wheel.

export const MOUSE_LEFT = 256;
export const MOUSE_RIGHT = 257;
export const MOUSE_MIDDLE = 258;
export const MOUSE_X1 = 259;
export const MOUSE_X2 = 260;
export const WHEEL_UP = 261;
export const WHEEL_DOWN = 262;
export const WHEEL_LEFT = 263;
export const WHEEL_RIGHT = 264;

export const MOD_CTRL = 1;
export const MOD_SHIFT = 2;
export const MOD_ALT = 4;
export const MOD_WIN = 8;

export const MODS: { bit: number; label: string }[] = [
  { bit: MOD_CTRL, label: "Ctrl" },
  { bit: MOD_SHIFT, label: "Shift" },
  { bit: MOD_ALT, label: "Alt" },
  { bit: MOD_WIN, label: "Win" },
];

const NAMES: Record<number, string> = {
  [MOUSE_LEFT]: "Left click",
  [MOUSE_RIGHT]: "Right click",
  [MOUSE_MIDDLE]: "Middle click",
  [MOUSE_X1]: "Mouse 4",
  [MOUSE_X2]: "Mouse 5",
  [WHEEL_UP]: "Wheel up",
  [WHEEL_DOWN]: "Wheel down",
  [WHEEL_LEFT]: "Wheel left",
  [WHEEL_RIGHT]: "Wheel right",
  0x03: "Break",
  0x08: "Backspace",
  0x09: "Tab",
  0x0c: "Clear",
  0x0d: "Enter",
  0x10: "Shift",
  0x11: "Ctrl",
  0x12: "Alt",
  0x13: "Pause",
  0x14: "Caps Lock",
  0x1b: "Esc",
  0x20: "Space",
  0x21: "Page Up",
  0x22: "Page Down",
  0x23: "End",
  0x24: "Home",
  0x25: "Left",
  0x26: "Up",
  0x27: "Right",
  0x28: "Down",
  0x2c: "Print Screen",
  0x2d: "Insert",
  0x2e: "Delete",
  0x5b: "Left Win",
  0x5c: "Right Win",
  0x5d: "Menu",
  0x6a: "Num *",
  0x6b: "Num +",
  0x6d: "Num -",
  0x6e: "Num .",
  0x6f: "Num /",
  0x90: "Num Lock",
  0x91: "Scroll Lock",
  0xa0: "Left Shift",
  0xa1: "Right Shift",
  0xa2: "Left Ctrl",
  0xa3: "Right Ctrl",
  0xa4: "Left Alt",
  0xa5: "Right Alt",
  0xa6: "Browser Back",
  0xa7: "Browser Forward",
  0xad: "Mute",
  0xae: "Volume Down",
  0xaf: "Volume Up",
  0xb0: "Next Track",
  0xb1: "Prev Track",
  0xb2: "Stop Media",
  0xb3: "Play/Pause",
  0xba: ";",
  0xbb: "=",
  0xbc: ",",
  0xbd: "-",
  0xbe: ".",
  0xbf: "/",
  0xc0: "`",
  0xdb: "[",
  0xdc: "\\",
  0xdd: "]",
  0xde: "'",
  0xe2: "\\ (ISO)",
};

export function keyName(code: number): string {
  if (!code) return "Not set";
  const fixed = NAMES[code];
  if (fixed) return fixed;
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a)) return String.fromCharCode(code);
  if (code >= 0x60 && code <= 0x69) return `Num ${code - 0x60}`;
  if (code >= 0x70 && code <= 0x87) return `F${code - 0x6f}`;
  return `Key ${code.toString(16).toUpperCase().padStart(2, "0")}`;
}

export function modsLabel(mods: number): string[] {
  return MODS.filter((m) => mods & m.bit).map((m) => m.label);
}

/** "Ctrl + Shift + F" */
export function comboName(input: number, mods: number): string {
  return [...modsLabel(mods), keyName(input)].join(" + ");
}

export const isMouseButton = (c: number) => c >= MOUSE_LEFT && c <= MOUSE_X2;
export const isWheel = (c: number) => c >= WHEEL_UP && c <= WHEEL_RIGHT;
export const isMouse = (c: number) => isMouseButton(c) || isWheel(c);

/** Every input, grouped, for the picker. */
export const KEY_GROUPS: { label: string; codes: number[] }[] = [
  { label: "Mouse", codes: [MOUSE_LEFT, MOUSE_RIGHT, MOUSE_MIDDLE, MOUSE_X1, MOUSE_X2, WHEEL_UP, WHEEL_DOWN, WHEEL_LEFT, WHEEL_RIGHT] },
  { label: "Letters", codes: range(0x41, 0x5a) },
  { label: "Numbers", codes: range(0x30, 0x39) },
  { label: "Function", codes: range(0x70, 0x87) },
  {
    label: "Modifiers",
    codes: [0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0x5b, 0x5c],
  },
  {
    label: "Editing & navigation",
    codes: [0x20, 0x0d, 0x09, 0x08, 0x1b, 0x14, 0x2d, 0x2e, 0x24, 0x23, 0x21, 0x22, 0x26, 0x28, 0x25, 0x27, 0x2c, 0x91, 0x13, 0x5d],
  },
  { label: "Numpad", codes: [...range(0x60, 0x69), 0x6a, 0x6b, 0x6d, 0x6e, 0x6f, 0x90] },
  { label: "Symbols", codes: [0xc0, 0xbd, 0xbb, 0xdb, 0xdd, 0xdc, 0xba, 0xde, 0xbc, 0xbe, 0xbf] },
  { label: "Media", codes: [0xb3, 0xb0, 0xb1, 0xb2, 0xad, 0xae, 0xaf, 0xa6, 0xa7] },
];

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Browser KeyboardEvent.code to a virtual key (used by the browser preview). */
export function vkFromDomCode(code: string): number {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit\d$/.test(code)) return 0x30 + Number(code[5]);
  if (/^Numpad\d$/.test(code)) return 0x60 + Number(code[6]);
  const f = /^F(\d+)$/.exec(code);
  if (f) return 0x6f + Number(f[1]);
  const map: Record<string, number> = {
    ShiftLeft: 0xa0, ShiftRight: 0xa1, ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5,
    MetaLeft: 0x5b, MetaRight: 0x5c, Space: 0x20, Enter: 0x0d, Tab: 0x09, Backspace: 0x08, Escape: 0x1b,
    CapsLock: 0x14, Insert: 0x2d, Delete: 0x2e, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
    ArrowUp: 0x26, ArrowDown: 0x28, ArrowLeft: 0x25, ArrowRight: 0x27, ScrollLock: 0x91, Pause: 0x13,
    Backquote: 0xc0, Minus: 0xbd, Equal: 0xbb, BracketLeft: 0xdb, BracketRight: 0xdd, Backslash: 0xdc,
    Semicolon: 0xba, Quote: 0xde, Comma: 0xbc, Period: 0xbe, Slash: 0xbf, ContextMenu: 0x5d,
  };
  return map[code] ?? 0;
}
