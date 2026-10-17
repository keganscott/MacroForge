//! Engine -> UI: status and live events as Tauri events, the HUD overlay and
//! sound cues, and the tray's "Bindings on" tick.

use std::sync::atomic::{AtomicIsize, AtomicU64, Ordering};
use std::sync::Arc;

use macroforge_engine::model::{HudPosition, Settings};
use macroforge_engine::{Hud, MonitorEvent, Notifier, Status};
use parking_lot::Mutex;
use tauri::menu::CheckMenuItem;
use tauri::{AppHandle, Emitter, Wry};

#[derive(Clone, Copy)]
struct Prefs {
    hud: bool,
    sounds: bool,
    pos: HudPosition,
}

pub struct UiNotifier {
    app: AppHandle,
    prefs: Mutex<Prefs>,
    tray_check: Mutex<Option<CheckMenuItem<Wry>>>,
    hud_hwnd: AtomicIsize,
    hud_seq: Arc<AtomicU64>,
}

impl UiNotifier {
    pub fn new(app: AppHandle, s: &Settings) -> Self {
        UiNotifier {
            app,
            prefs: Mutex::new(Prefs { hud: s.hud, sounds: s.sounds, pos: s.hud_position }),
            tray_check: Mutex::new(None),
            hud_hwnd: AtomicIsize::new(0),
            hud_seq: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn update_prefs(&self, s: &Settings) {
        *self.prefs.lock() = Prefs { hud: s.hud, sounds: s.sounds, pos: s.hud_position };
    }

    pub fn set_tray_check(&self, item: CheckMenuItem<Wry>) {
        *self.tray_check.lock() = Some(item);
    }

    pub fn set_hud_hwnd(&self, hwnd: isize) {
        self.hud_hwnd.store(hwnd, Ordering::Relaxed);
    }

    /// Show a notice regardless of the HUD setting (Settings' preview button).
    pub fn show_hud(&self, hud: &Hud, force: bool) {
        let p = *self.prefs.lock();
        if p.sounds && !force {
            #[cfg(windows)]
            crate::shell::play_tone(hud.on);
        }
        if !(p.hud || force) {
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
                std::thread::sleep(std::time::Duration::from_millis(1600));
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
        if let Some(item) = self.tray_check.lock().as_ref() {
            let _ = item.set_checked(status.armed);
        }
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
