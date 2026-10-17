//! Windows bits the app shell needs: single instance, the HUD overlay
//! window, sound cues, relaunching as administrator.

use std::sync::OnceLock;

use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, HWND, RECT};
use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, SetForegroundWindow, SetWindowLongPtrW,
    SetWindowPos, ShowWindow, ShowWindowAsync, GWL_EXSTYLE, HWND_TOPMOST, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE,
    SWP_NOSIZE, SW_HIDE, SW_RESTORE, SW_SHOWNOACTIVATE, SW_SHOWNORMAL, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
};

use macroforge_engine::model::HudPosition;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

const ERROR_ALREADY_EXISTS: u32 = 183;

pub struct SingleInstance(HANDLE);
// SAFETY: a mutex handle, only closed on drop.
unsafe impl Send for SingleInstance {}
unsafe impl Sync for SingleInstance {}

impl Drop for SingleInstance {
    fn drop(&mut self) {
        // SAFETY: we own the handle.
        unsafe { CloseHandle(self.0) };
    }
}

/// Only one MacroForge runs (two would fight over every hotkey). A second
/// launch brings the first one's window forward and exits. `wait` (after a
/// relaunch as administrator) gives the old copy a few seconds to close.
pub fn single_instance(wait: bool) -> Option<SingleInstance> {
    let name = wide("Local\\MacroForge.SingleInstance");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(if wait { 6 } else { 0 });
    loop {
        // SAFETY: named mutex; checked with GetLastError right after.
        let (h, exists) = unsafe {
            let h = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
            (h, GetLastError() == ERROR_ALREADY_EXISTS)
        };
        if !exists && !h.is_null() {
            return Some(SingleInstance(h));
        }
        if !h.is_null() {
            unsafe { CloseHandle(h) };
        }
        if std::time::Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    // SAFETY: finding and restoring the other copy's window by its title.
    unsafe {
        let hwnd = FindWindowW(std::ptr::null(), wide("MacroForge").as_ptr());
        if !hwnd.is_null() {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
        }
    }
    None
}

/// Make the HUD a click-through overlay that never takes focus (so showing
/// it can never pull a game out of the foreground) and stays off Alt+Tab.
pub fn make_overlay(hwnd: HWND) {
    // SAFETY: adjusting extended styles of our own window.
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, (ex | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT) as isize);
    }
}

/// Show the HUD on the monitor of the app in front, without activating it.
/// Async calls, so the engine thread never waits on the UI thread.
pub fn show_overlay(hwnd: HWND, pos: HudPosition) {
    use windows_sys::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY};
    // SAFETY: queries plus async positioning of our own window.
    unsafe {
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        let mon = MonitorFromWindow(GetForegroundWindow(), MONITOR_DEFAULTTOPRIMARY);
        if GetMonitorInfoW(mon, &mut mi) == 0 {
            return;
        }
        let mut r: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut r);
        let (w, h) = (r.right - r.left, r.bottom - r.top);
        let wa = mi.rcWork;
        let margin = 24;
        let x = match pos {
            HudPosition::TopLeft | HudPosition::BottomLeft => wa.left + margin,
            HudPosition::TopCenter => wa.left + (wa.right - wa.left - w) / 2,
            HudPosition::TopRight | HudPosition::BottomRight => wa.right - w - margin,
        };
        let y = match pos {
            HudPosition::BottomLeft | HudPosition::BottomRight => wa.bottom - h - margin,
            _ => wa.top + margin,
        };
        SetWindowPos(hwnd, HWND_TOPMOST, x, y, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
        ShowWindowAsync(hwnd, SW_SHOWNOACTIVATE);
    }
}

pub fn hide_overlay(hwnd: HWND) {
    // SAFETY: async hide of our own window.
    unsafe { ShowWindowAsync(hwnd, SW_HIDE) };
}

/// A short tone, built once as an in-memory WAV: rising for on, falling for off.
fn tone(on: bool) -> &'static [u8] {
    static ON: OnceLock<Vec<u8>> = OnceLock::new();
    static OFF: OnceLock<Vec<u8>> = OnceLock::new();
    let build = |freqs: [f64; 2]| {
        let rate = 22_050u32;
        let mut samples: Vec<i16> = Vec::new();
        for f in freqs {
            let n = (rate as f64 * 0.055) as usize;
            for i in 0..n {
                let t = i as f64 / rate as f64;
                let env = (i.min(n - i) as f64 / (n as f64 * 0.2)).min(1.0);
                samples.push(((t * f * std::f64::consts::TAU).sin() * env * 0.22 * i16::MAX as f64) as i16);
            }
        }
        let data_len = (samples.len() * 2) as u32;
        let mut w = Vec::with_capacity(44 + data_len as usize);
        w.extend_from_slice(b"RIFF");
        w.extend_from_slice(&(36 + data_len).to_le_bytes());
        w.extend_from_slice(b"WAVEfmt ");
        w.extend_from_slice(&16u32.to_le_bytes());
        w.extend_from_slice(&1u16.to_le_bytes()); // PCM
        w.extend_from_slice(&1u16.to_le_bytes()); // mono
        w.extend_from_slice(&rate.to_le_bytes());
        w.extend_from_slice(&(rate * 2).to_le_bytes());
        w.extend_from_slice(&2u16.to_le_bytes());
        w.extend_from_slice(&16u16.to_le_bytes());
        w.extend_from_slice(b"data");
        w.extend_from_slice(&data_len.to_le_bytes());
        for s in samples {
            w.extend_from_slice(&s.to_le_bytes());
        }
        w
    };
    if on {
        ON.get_or_init(|| build([660.0, 990.0]))
    } else {
        OFF.get_or_init(|| build([660.0, 440.0]))
    }
}

pub fn play_tone(on: bool) {
    let wav = tone(on);
    // SAFETY: the WAV buffer is 'static, as SND_ASYNC | SND_MEMORY requires.
    unsafe { PlaySoundW(wav.as_ptr() as *const u16, std::ptr::null_mut(), SND_MEMORY | SND_ASYNC | SND_NODEFAULT) };
}

/// Start an elevated copy (UAC prompt). Returns false if the user said no.
pub fn relaunch_as_admin() -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let exe = wide(&exe.to_string_lossy());
    // SAFETY: standard "runas" shell verb.
    let r = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            wide("runas").as_ptr(),
            exe.as_ptr(),
            wide("--relaunch").as_ptr(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    r as usize > 32
}
