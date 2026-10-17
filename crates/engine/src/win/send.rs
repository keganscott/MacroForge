//! Synthetic input through `SendInput`.
//!
//! Keys are sent as hardware scan codes (with the extended flag where the key
//! needs it), the way a real keyboard reports them; games that read
//! DirectInput or raw input ignore virtual-key-only events. Every event is
//! tagged with `INJECT_TAG` so MacroForge's own hook lets it through.

use std::sync::atomic::{AtomicU64, Ordering};

use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, KEYEVENTF_UNICODE, MAPVK_VK_TO_VSC_EX, MOUSEEVENTF_ABSOLUTE,
    MOUSEEVENTF_HWHEEL, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
    MOUSEEVENTF_MOVE, MOUSEEVENTF_MOVE_NOCOALESCE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_VIRTUALDESK,
    MOUSEEVENTF_WHEEL, MOUSEEVENTF_XDOWN, MOUSEEVENTF_XUP, MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
};

use crate::gate::INJECT_TAG;
use crate::input::{self, Input};
use crate::runner::Output;

const WHEEL_DELTA: i32 = 120;

#[derive(Default)]
pub struct SendOutput {
    failures: AtomicU64,
}

impl SendOutput {
    pub fn failures(&self) -> u64 {
        self.failures.load(Ordering::Relaxed)
    }

    fn send(&self, inputs: &[INPUT]) {
        if inputs.is_empty() {
            return;
        }
        // SAFETY: `inputs` is a valid slice of initialised INPUT structs.
        let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
        if (sent as usize) < inputs.len() {
            // Usually UIPI: the window in front runs as administrator.
            self.failures.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn key(vk: u16, scan: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: INJECT_TAG } },
    }
}

fn mouse(dx: i32, dy: i32, data: i32, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT { dx, dy, mouseData: data as u32, dwFlags: flags, time: 0, dwExtraInfo: INJECT_TAG },
        },
    }
}

/// The keyboard INPUT for a virtual key: scan code where Windows knows one.
pub fn key_input(vk: u8, down: bool) -> INPUT {
    let up = if down { 0 } else { KEYEVENTF_KEYUP };
    // SAFETY: pure lookup.
    let sc = unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC_EX) };
    let prefix = sc >> 8;
    // Pause (E1 prefix) and keys with no scan code go by virtual key.
    if sc == 0 || prefix == 0xE1 || vk == 0x13 {
        return key(vk as u16, 0, up);
    }
    let ext = if prefix == 0xE0 { KEYEVENTF_EXTENDEDKEY } else { 0 };
    key(vk as u16, (sc & 0xFF) as u16, KEYEVENTF_SCANCODE | ext | up)
}

fn button_input(code: Input, down: bool) -> Option<INPUT> {
    let (flags, data) = match (code, down) {
        (input::MOUSE_LEFT, true) => (MOUSEEVENTF_LEFTDOWN, 0),
        (input::MOUSE_LEFT, false) => (MOUSEEVENTF_LEFTUP, 0),
        (input::MOUSE_RIGHT, true) => (MOUSEEVENTF_RIGHTDOWN, 0),
        (input::MOUSE_RIGHT, false) => (MOUSEEVENTF_RIGHTUP, 0),
        (input::MOUSE_MIDDLE, true) => (MOUSEEVENTF_MIDDLEDOWN, 0),
        (input::MOUSE_MIDDLE, false) => (MOUSEEVENTF_MIDDLEUP, 0),
        (input::MOUSE_X1, true) => (MOUSEEVENTF_XDOWN, 1),
        (input::MOUSE_X1, false) => (MOUSEEVENTF_XUP, 1),
        (input::MOUSE_X2, true) => (MOUSEEVENTF_XDOWN, 2),
        (input::MOUSE_X2, false) => (MOUSEEVENTF_XUP, 2),
        _ => return None,
    };
    Some(mouse(0, 0, data, flags))
}

impl Output for SendOutput {
    fn input(&self, code: Input, down: bool) {
        if input::is_key(code) {
            self.send(&[key_input(code as u8, down)]);
        } else if input::is_mouse_button(code) {
            if let Some(i) = button_input(code, down) {
                self.send(&[i]);
            }
        } else if input::is_wheel(code) && down {
            match code {
                input::WHEEL_UP => self.wheel(1, false),
                input::WHEEL_DOWN => self.wheel(-1, false),
                input::WHEEL_RIGHT => self.wheel(1, true),
                _ => self.wheel(-1, true),
            }
        }
    }

    fn wheel(&self, notches: i32, horizontal: bool) {
        let flags = if horizontal { MOUSEEVENTF_HWHEEL } else { MOUSEEVENTF_WHEEL };
        self.send(&[mouse(0, 0, notches.saturating_mul(WHEEL_DELTA), flags)]);
    }

    fn move_rel(&self, dx: i32, dy: i32) {
        if dx != 0 || dy != 0 {
            self.send(&[mouse(dx, dy, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_MOVE_NOCOALESCE)]);
        }
    }

    fn move_to(&self, x: i32, y: i32) {
        // SAFETY: plain metric queries.
        let (vx, vy, vw, vh) = unsafe {
            (
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN).max(2),
                GetSystemMetrics(SM_CYVIRTUALSCREEN).max(2),
            )
        };
        let nx = (((x - vx) as i64 * 65535) / (vw as i64 - 1)).clamp(0, 65535) as i32;
        let ny = (((y - vy) as i64 * 65535) / (vh as i64 - 1)).clamp(0, 65535) as i32;
        self.send(&[mouse(nx, ny, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK)]);
    }

    fn text(&self, ch: char) {
        match ch {
            '\n' => return self.send(&[key_input(0x0D, true), key_input(0x0D, false)]),
            '\t' => return self.send(&[key_input(0x09, true), key_input(0x09, false)]),
            _ => {}
        }
        let mut buf = [0u16; 2];
        let mut inputs = Vec::with_capacity(4);
        for unit in ch.encode_utf16(&mut buf).iter() {
            inputs.push(key(0, *unit, KEYEVENTF_UNICODE));
        }
        for unit in ch.encode_utf16(&mut buf).iter() {
            inputs.push(key(0, *unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
        }
        self.send(&inputs);
    }
}
