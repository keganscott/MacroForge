//! Input codes: one `u16` space for every key, mouse button and wheel
//! direction, so the hook can index its trigger table directly.
//!
//! 0..=255   Windows virtual-key codes (left/right modifiers are distinct)
//! 256..=260 mouse buttons: left, right, middle, X1 (back), X2 (forward)
//! 261..=264 wheel: up, down, left, right

pub type Input = u16;

pub const MOUSE_LEFT: Input = 256;
pub const MOUSE_RIGHT: Input = 257;
pub const MOUSE_MIDDLE: Input = 258;
pub const MOUSE_X1: Input = 259;
pub const MOUSE_X2: Input = 260;
pub const WHEEL_UP: Input = 261;
pub const WHEEL_DOWN: Input = 262;
pub const WHEEL_LEFT: Input = 263;
pub const WHEEL_RIGHT: Input = 264;
/// Size of every per-input table.
pub const INPUT_COUNT: usize = 265;

pub const MOD_CTRL: u8 = 1;
pub const MOD_SHIFT: u8 = 2;
pub const MOD_ALT: u8 = 4;
pub const MOD_WIN: u8 = 8;
pub const MOD_ALL: u8 = 15;

pub fn is_valid(code: Input) -> bool {
    (code as usize) < INPUT_COUNT && code != 0
}

pub fn is_key(code: Input) -> bool {
    code > 0 && code < 256
}

pub fn is_mouse_button(code: Input) -> bool {
    (MOUSE_LEFT..=MOUSE_X2).contains(&code)
}

pub fn is_wheel(code: Input) -> bool {
    (WHEEL_UP..=WHEEL_RIGHT).contains(&code)
}

/// Wheel inputs have no "up": they are one notch per event.
pub fn is_momentary(code: Input) -> bool {
    is_wheel(code)
}

/// The modifier bit a key contributes, if it is a modifier key.
pub fn modifier_bit(code: Input) -> u8 {
    match code {
        0x10 | 0xA0 | 0xA1 => MOD_SHIFT,
        0x11 | 0xA2 | 0xA3 => MOD_CTRL,
        0x12 | 0xA4 | 0xA5 => MOD_ALT,
        0x5B | 0x5C => MOD_WIN,
        _ => 0,
    }
}

/// The left-hand key used when a macro has to press a modifier.
pub fn modifier_keys(mods: u8) -> impl Iterator<Item = Input> {
    [(MOD_CTRL, 0xA2u16), (MOD_SHIFT, 0xA0), (MOD_ALT, 0xA4), (MOD_WIN, 0x5B)]
        .into_iter()
        .filter(move |(bit, _)| mods & bit != 0)
        .map(|(_, vk)| vk)
}

/// A short readable name, for logs and the HUD. The UI has its own, fuller table.
pub fn name(code: Input) -> String {
    let fixed = match code {
        MOUSE_LEFT => "Left click",
        MOUSE_RIGHT => "Right click",
        MOUSE_MIDDLE => "Middle click",
        MOUSE_X1 => "Mouse 4",
        MOUSE_X2 => "Mouse 5",
        WHEEL_UP => "Wheel up",
        WHEEL_DOWN => "Wheel down",
        WHEEL_LEFT => "Wheel left",
        WHEEL_RIGHT => "Wheel right",
        0x08 => "Backspace",
        0x09 => "Tab",
        0x0D => "Enter",
        0x13 => "Pause",
        0x14 => "Caps Lock",
        0x1B => "Esc",
        0x20 => "Space",
        0x21 => "Page Up",
        0x22 => "Page Down",
        0x23 => "End",
        0x24 => "Home",
        0x25 => "Left",
        0x26 => "Up",
        0x27 => "Right",
        0x28 => "Down",
        0x2C => "Print Screen",
        0x2D => "Insert",
        0x2E => "Delete",
        0x5B => "Left Win",
        0x5C => "Right Win",
        0x91 => "Scroll Lock",
        0x90 => "Num Lock",
        0xA0 => "Left Shift",
        0xA1 => "Right Shift",
        0xA2 => "Left Ctrl",
        0xA3 => "Right Ctrl",
        0xA4 => "Left Alt",
        0xA5 => "Right Alt",
        _ => "",
    };
    if !fixed.is_empty() {
        return fixed.to_string();
    }
    match code {
        0x30..=0x39 | 0x41..=0x5A => ((code as u8) as char).to_string(),
        0x60..=0x69 => format!("Num {}", code - 0x60),
        0x70..=0x87 => format!("F{}", code - 0x6F),
        _ => format!("Key 0x{code:02X}"),
    }
}

pub fn mods_name(mods: u8) -> String {
    let mut s = String::new();
    for (bit, n) in [(MOD_CTRL, "Ctrl+"), (MOD_SHIFT, "Shift+"), (MOD_ALT, "Alt+"), (MOD_WIN, "Win+")] {
        if mods & bit != 0 {
            s.push_str(n);
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges_do_not_overlap() {
        assert!(is_key(0x41));
        assert!(!is_key(MOUSE_LEFT));
        assert!(is_mouse_button(MOUSE_X2));
        assert!(!is_mouse_button(WHEEL_UP));
        assert!(is_wheel(WHEEL_RIGHT));
        assert!(!is_valid(INPUT_COUNT as u16));
        assert!(!is_valid(0));
    }

    #[test]
    fn modifier_bits() {
        assert_eq!(modifier_bit(0xA3), MOD_CTRL);
        assert_eq!(modifier_bit(0x5C), MOD_WIN);
        assert_eq!(modifier_bit(0x41), 0);
        assert_eq!(modifier_keys(MOD_CTRL | MOD_ALT).collect::<Vec<_>>(), vec![0xA2, 0xA4]);
    }

    #[test]
    fn names() {
        assert_eq!(name(0x70), "F1");
        assert_eq!(name(0x41), "A");
        assert_eq!(name(MOUSE_X1), "Mouse 4");
        assert_eq!(mods_name(MOD_CTRL | MOD_SHIFT), "Ctrl+Shift+");
    }
}
