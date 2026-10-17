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

use macroforge_engine::model::{HudPosition, SoundStyle};

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

// ------------------------------------------------------------- sounds --
//
// Cues are meant to be felt more than heard (docs/DESIGN.md): short, soft
// and quiet, like a key switch rather than a beep. Synthesised once per
// (style, on/off, volume step) and kept, since PlaySound plays from memory
// asynchronously and needs the buffer to outlive the call.

const RATE: u32 = 44_100;

fn secs(n: usize) -> f64 {
    n as f64 / RATE as f64
}

/// One soft mechanical "tock": a quick high tick over a small low body.
fn click(buf: &mut [f64], at: f64, pitch: f64, gain: f64) {
    let start = (at * RATE as f64) as usize;
    let mut lp = 0.0;
    let mut seed: u32 = 0x9E37_79B9;
    for i in 0..((0.045 * RATE as f64) as usize) {
        let Some(slot) = buf.get_mut(start + i) else { break };
        let t = secs(i);
        // Filtered noise: the contact of the switch.
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        let noise = (seed as f64 / u32::MAX as f64) * 2.0 - 1.0;
        lp += (noise - lp) * 0.18;
        let contact = lp * (-t / 0.0015).exp() * 0.6;
        let tick = (t * 2200.0 * pitch * std::f64::consts::TAU).sin() * (-t / 0.004).exp() * 0.35;
        let body = (t * 420.0 * pitch * std::f64::consts::TAU).sin() * (-t / 0.012).exp();
        *slot += (contact + tick + body) * gain;
    }
}

/// A soft glass note: gentle attack, long smooth decay, a touch of overtone.
fn chime(buf: &mut [f64], at: f64, freq: f64, gain: f64) {
    let start = (at * RATE as f64) as usize;
    for i in 0..((0.42 * RATE as f64) as usize) {
        let Some(slot) = buf.get_mut(start + i) else { break };
        let t = secs(i);
        let attack = (t / 0.006).min(1.0);
        let w = t * freq * std::f64::consts::TAU;
        let v = w.sin() * (-t / 0.14).exp() + (2.0 * w).sin() * 0.12 * (-t / 0.05).exp();
        *slot += v * attack * gain;
    }
}

/// A small rounded "pop" whose pitch glides up (on) or down (off).
fn pop(buf: &mut [f64], at: f64, from: f64, to: f64, gain: f64) {
    let start = (at * RATE as f64) as usize;
    let len = (0.07 * RATE as f64) as usize;
    let mut phase = 0.0;
    for i in 0..len {
        let Some(slot) = buf.get_mut(start + i) else { break };
        let k = i as f64 / len as f64;
        let f = from * (to / from).powf(k);
        phase += f / RATE as f64 * std::f64::consts::TAU;
        let env = (k * std::f64::consts::PI).sin().powf(1.5);
        *slot += phase.sin() * env * gain;
    }
}

fn synth(style: SoundStyle, on: bool, volume: u8) -> Vec<u8> {
    let mut buf = vec![0.0f64; (0.6 * RATE as f64) as usize];
    match (style, on) {
        (SoundStyle::Click, true) => {
            click(&mut buf, 0.0, 1.0, 1.0);
            click(&mut buf, 0.065, 1.3, 0.75);
        }
        (SoundStyle::Click, false) => {
            click(&mut buf, 0.0, 0.85, 1.0);
            click(&mut buf, 0.065, 0.65, 0.75);
        }
        (SoundStyle::Chime, true) => {
            chime(&mut buf, 0.0, 880.0, 1.0);
            chime(&mut buf, 0.085, 1318.5, 0.8);
        }
        (SoundStyle::Chime, false) => {
            chime(&mut buf, 0.0, 1318.5, 0.8);
            chime(&mut buf, 0.085, 880.0, 1.0);
        }
        (SoundStyle::Pop, true) => pop(&mut buf, 0.0, 380.0, 760.0, 1.0),
        (SoundStyle::Pop, false) => pop(&mut buf, 0.0, 620.0, 300.0, 1.0),
    }
    // Trim trailing silence, then normalise to a quiet, perceptual level:
    // 100 % peaks at 0.35 of full scale; the default 30 % at about 0.045,
    // some 14 dB under the first version's plain 0.22 sine beep.
    let last = buf.iter().rposition(|v| v.abs() > 1e-4).unwrap_or(0);
    buf.truncate(last + 1);
    let peak = buf.iter().fold(0.0f64, |m, v| m.max(v.abs())).max(1e-9);
    let target = 0.35 * (volume.min(100) as f64 / 100.0).powf(1.7);
    let fade = (0.004 * RATE as f64) as usize;
    let n = buf.len();
    let samples: Vec<i16> = buf
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let tail = if n - i < fade { (n - i) as f64 / fade as f64 } else { 1.0 };
            (v / peak * target * tail * i16::MAX as f64) as i16
        })
        .collect();

    let data_len = (samples.len() * 2) as u32;
    let mut w = Vec::with_capacity(44 + data_len as usize);
    w.extend_from_slice(b"RIFF");
    w.extend_from_slice(&(36 + data_len).to_le_bytes());
    w.extend_from_slice(b"WAVEfmt ");
    w.extend_from_slice(&16u32.to_le_bytes());
    w.extend_from_slice(&1u16.to_le_bytes()); // PCM
    w.extend_from_slice(&1u16.to_le_bytes()); // mono
    w.extend_from_slice(&RATE.to_le_bytes());
    w.extend_from_slice(&(RATE * 2).to_le_bytes());
    w.extend_from_slice(&2u16.to_le_bytes());
    w.extend_from_slice(&16u16.to_le_bytes());
    w.extend_from_slice(b"data");
    w.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        w.extend_from_slice(&s.to_le_bytes());
    }
    w
}

pub fn play_cue(style: SoundStyle, on: bool, volume: u8) {
    use std::collections::HashMap;
    use std::sync::Mutex;
    type Cache = Mutex<HashMap<(u8, bool, u8), &'static [u8]>>;
    static CACHE: OnceLock<Cache> = OnceLock::new();
    // Volume in 5 % steps keeps the cache small.
    let step = (volume.min(100) / 5) * 5;
    if step == 0 {
        return;
    }
    let key = (style as u8, on, step);
    let wav: &'static [u8] = {
        let mut cache = CACHE.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner());
        cache.entry(key).or_insert_with(|| Box::leak(synth(style, on, step).into_boxed_slice()))
    };
    // SAFETY: the buffer is 'static, as SND_ASYNC | SND_MEMORY requires.
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
