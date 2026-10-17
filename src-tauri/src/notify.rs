//! Engine -> UI: status and live events as Tauri events, the HUD overlay and
//! sound cues, the tray icon (lit while bindings are on) and its menu tick.

use std::sync::atomic::{AtomicIsize, AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;

use macroforge_engine::model::{HudPosition, Settings, SoundStyle};
use macroforge_engine::{Hud, MonitorEvent, Notifier, Status};
use parking_lot::Mutex;
use tauri::image::Image;
use tauri::menu::CheckMenuItem;
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Emitter, Wry};

#[derive(Clone, Copy)]
struct Prefs {
    hud: bool,
    sounds: bool,
    style: SoundStyle,
    volume: u8,
    pos: HudPosition,
}

impl Prefs {
    fn from(s: &Settings) -> Self {
        Prefs { hud: s.hud, sounds: s.sounds, style: s.sound_style, volume: s.sound_volume, pos: s.hud_position }
    }
}

/// 32x32 RGBA tray icons drawn by tools/make_icon.py.
const TRAY_ON: &[u8] = include_bytes!("../icons/tray-on.rgba");
const TRAY_OFF: &[u8] = include_bytes!("../icons/tray-off.rgba");

pub struct UiNotifier {
    app: AppHandle,
    prefs: Mutex<Prefs>,
    tray_check: Mutex<Option<CheckMenuItem<Wry>>>,
    tray: Mutex<Option<TrayIcon<Wry>>>,
    /// 0 unknown, 1 off, 2 on: the tray icon is only swapped on a change.
    tray_state: AtomicU8,
    hud_hwnd: AtomicIsize,
    hud_seq: Arc<AtomicU64>,
}

impl UiNotifier {
    pub fn new(app: AppHandle, s: &Settings) -> Self {
        UiNotifier {
            app,
            prefs: Mutex::new(Prefs::from(s)),
            tray_check: Mutex::new(None),
            tray: Mutex::new(None),
            tray_state: AtomicU8::new(0),
            hud_hwnd: AtomicIsize::new(0),
            hud_seq: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn update_prefs(&self, s: &Settings) {
        *self.prefs.lock() = Prefs::from(s);
    }

    pub fn set_tray(&self, tray: TrayIcon<Wry>, check: CheckMenuItem<Wry>, armed: bool) {
        *self.tray.lock() = Some(tray);
        *self.tray_check.lock() = Some(check);
        self.show_armed(armed);
    }

    pub fn set_hud_hwnd(&self, hwnd: isize) {
        self.hud_hwnd.store(hwnd, Ordering::Relaxed);
    }

    fn show_armed(&self, armed: bool) {
        let state = if armed { 2 } else { 1 };
        if self.tray_state.swap(state, Ordering::Relaxed) == state {
            return;
        }
        if let Some(tray) = self.tray.lock().as_ref() {
            let rgba = if armed { TRAY_ON } else { TRAY_OFF };
            let _ = tray.set_icon(Some(Image::new_owned(rgba.to_vec(), 32, 32)));
            let _ = tray.set_tooltip(Some(if armed { "MacroForge: bindings on" } else { "MacroForge: bindings off" }));
        }
        if let Some(item) = self.tray_check.lock().as_ref() {
            let _ = item.set_checked(armed);
        }
    }

    /// Play the current cue now, whatever the sound switch says (Settings' test button).
    pub fn test_sound(&self, on: bool) {
        let p = *self.prefs.lock();
        #[cfg(windows)]
        crate::shell::play_cue(p.style, on, p.volume);
        let _ = p;
        let _ = on;
    }

    /// Show a notice. `preview` (Settings) shows it even with the HUD off and
    /// keeps it out of the activity list and silent.
    pub fn show_hud(&self, hud: &Hud, preview: bool) {
        let p = *self.prefs.lock();
        if !preview {
            let _ = self.app.emit_to("main", "activity", hud);
            if p.sounds {
                #[cfg(windows)]
                crate::shell::play_cue(p.style, hud.on, p.volume);
            }
        }
        if !(p.hud || preview) {
            return;
        }
        let _ = self.app.emit_to("hud", "hud", hud);
        #[cfg(windows)]
        {
            let hwnd = self.hud_hwnd.load(Ordering::Relaxed);
            if hwnd == 0 {
                return;
            }
            crate::shell::show_overlay(hwnd as _, p.pos);
            let seq = self.hud_seq.fetch_add(1, Ordering::SeqCst) + 1;
            let counter = self.hud_seq.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1700));
                if counter.load(Ordering::SeqCst) == seq {
                    crate::shell::hide_overlay(hwnd as _);
                }
            });
        }
    }
}

impl Notifier for UiNotifier {
    fn status(&self, status: &Status) {
        let _ = self.app.emit_to("main", "status", status);
        self.show_armed(status.armed);
    }

    fn hud(&self, hud: &Hud) {
        self.show_hud(hud, false);
    }

    fn monitor(&self, events: &[MonitorEvent]) {
        let _ = self.app.emit_to("main", "monitor", events);
    }

    fn recorded(&self, count: usize) {
        let _ = self.app.emit_to("main", "recorded", count);
    }
}
