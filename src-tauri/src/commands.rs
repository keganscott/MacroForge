//! IPC commands. Thin: validate, hand to the engine or the store, return.
//! Anything that can block (key capture, benchmark) runs off the IPC thread.

use std::time::Duration;

use macroforge_engine::bench::{self, BenchRow};
use macroforge_engine::model::{Data, Step, TimingMode};
use macroforge_engine::{store, Hud, Stats, Status};
use serde::Serialize;
use tauri::State;

use crate::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    data: Data,
    status: Status,
    warning: Option<String>,
    data_dir: String,
    version: String,
    autostart: bool,
}

#[tauri::command]
pub fn get_snapshot(st: State<AppState>) -> Snapshot {
    Snapshot {
        data: st.data.lock().clone(),
        status: st.engine.status(),
        warning: st.warning.lock().take(),
        data_dir: st.dir.display().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        #[cfg(windows)]
        autostart: macroforge_engine::win::sys::autostart_enabled(),
        #[cfg(not(windows))]
        autostart: false,
    }
}

/// Save everything the user edits. Returns the data as stored (clamped), so
/// the UI always shows what will actually run.
#[tauri::command]
pub fn save_data(st: State<AppState>, mut data: Data) -> Result<Data, String> {
    data.sanitize();
    let autostart_changed = st.data.lock().settings.start_with_windows != data.settings.start_with_windows;
    #[cfg(windows)]
    if autostart_changed {
        let cmd = std::env::current_exe().map_err(|e| e.to_string())?;
        let cmd = format!("\"{}\" --minimized", cmd.display());
        macroforge_engine::win::sys::set_autostart(data.settings.start_with_windows.then_some(cmd.as_str()))
            .map_err(|e| format!("Could not change Start with Windows: {e}"))?;
    }
    let _ = autostart_changed;
    store::save(&st.dir, &data).map_err(|e| format!("Could not save: {e}"))?;
    st.notifier.update_prefs(&data.settings);
    st.engine.set_data(data.clone());
    *st.data.lock() = data.clone();
    Ok(data)
}

#[tauri::command]
pub fn set_armed(st: State<AppState>, armed: Option<bool>) {
    st.engine.set_armed(armed);
}

#[tauri::command]
pub fn panic_stop(st: State<AppState>) {
    st.engine.panic();
}

#[derive(Serialize)]
pub struct Captured {
    input: u16,
    mods: u8,
}

/// Wait for the next key or mouse button (it is swallowed). None on timeout.
#[tauri::command]
pub async fn capture_input(st: State<'_, AppState>, timeout_ms: u64) -> Result<Option<Captured>, String> {
    let engine = st.engine.clone();
    let ms = timeout_ms.clamp(500, 30_000);
    tauri::async_runtime::spawn_blocking(move || {
        engine.capture(Duration::from_millis(ms)).map(|(input, mods)| Captured { input, mods })
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_capture(st: State<AppState>) {
    st.engine.cancel_capture();
}

#[tauri::command]
pub fn record_start(st: State<AppState>) {
    st.engine.record_start();
}

#[tauri::command]
pub async fn record_stop(st: State<'_, AppState>) -> Result<Vec<Step>, String> {
    let engine = st.engine.clone();
    tauri::async_runtime::spawn_blocking(move || engine.record_stop()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn play_steps(st: State<AppState>, id: String, label: String, steps: Vec<Step>) -> Result<(), String> {
    let mut steps = steps;
    steps.truncate(macroforge_engine::model::MAX_STEPS);
    steps.retain_mut(Step::sanitize);
    let id: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(64).collect();
    st.engine.play(id, label.chars().take(60).collect(), steps);
    Ok(())
}

#[tauri::command]
pub fn stop_run(st: State<AppState>, id: String) {
    st.engine.stop_run(id);
}

#[tauri::command]
pub fn set_monitor(st: State<AppState>, on: bool) {
    st.engine.set_monitor(on);
}

#[tauri::command]
pub fn get_status(st: State<AppState>) -> Status {
    st.engine.status()
}

#[tauri::command]
pub fn get_stats(st: State<AppState>) -> Stats {
    st.engine.stats()
}

#[tauri::command]
pub fn reset_stats(st: State<AppState>) {
    st.engine.reset_stats();
}

/// Measure wait accuracy on this PC in both timing modes, on a thread set up
/// exactly like a macro's.
#[tauri::command]
pub async fn run_benchmark() -> Result<Vec<BenchRow>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut rows = Vec::new();
        #[cfg(windows)]
        {
            use macroforge_engine::win::{sys, timer::HiResWaiter};
            sys::raise_thread_priority(false);
            for (mode, name) in [(TimingMode::Precise, "Precise"), (TimingMode::Efficient, "Efficient")] {
                let mut w = HiResWaiter::new(mode);
                for (target, n) in [(1.0, 80), (5.0, 60), (16.7, 30)] {
                    rows.push(bench::measure(name, &mut w, target, n));
                }
            }
        }
        #[cfg(not(windows))]
        {
            let _ = TimingMode::Precise;
            let mut w = macroforge_engine::timing::SpinWaiter { spin_ms: 1.0 };
            rows.push(bench::measure("Portable", &mut w, 1.0, 50));
        }
        rows
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct AppEntry {
    exe: String,
    title: String,
}

#[tauri::command]
pub fn list_apps() -> Vec<AppEntry> {
    #[cfg(windows)]
    {
        macroforge_engine::win::sys::window_apps().into_iter().map(|(exe, title)| AppEntry { exe, title }).collect()
    }
    #[cfg(not(windows))]
    Vec::new()
}

/// Restart as administrator (needed to send input to games that run elevated).
#[tauri::command]
pub fn relaunch_admin(app: tauri::AppHandle) -> bool {
    #[cfg(windows)]
    if crate::shell::relaunch_as_admin() {
        app.exit(0);
        return true;
    }
    let _ = app;
    false
}

#[tauri::command]
pub fn open_data_dir(st: State<AppState>) {
    let _ = std::fs::create_dir_all(&st.dir);
    let _ = std::process::Command::new("explorer").arg(&st.dir).spawn();
}

static CURSOR_TEST: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// "Test in my game" for Pause in menus: for `seconds`, the on-screen notice
/// says whether the cursor is showing each time that changes, so you can
/// switch to a game, open its inventory and see if it is detected. Also
/// reports to the window (event "cursor-test") for the button's countdown.
#[tauri::command]
pub fn cursor_test(app: tauri::AppHandle, st: State<AppState>, seconds: u32) {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    if CURSOR_TEST.swap(true, Ordering::SeqCst) {
        return;
    }
    let notifier = st.notifier.clone();
    let seconds = seconds.clamp(5, 60);
    std::thread::spawn(move || {
        #[cfg(windows)]
        let probe = macroforge_engine::win::sys::cursor_visible;
        #[cfg(not(windows))]
        let probe = || false;
        let start = std::time::Instant::now();
        let mut last: Option<bool> = None;
        let mut last_left = u32::MAX;
        while start.elapsed().as_secs() < seconds as u64 {
            let visible = probe();
            if last != Some(visible) {
                last = Some(visible);
                let hud = if visible {
                    Hud { text: "Menu: clicks pass through off".into(), on: false }
                } else {
                    Hud { text: "Gameplay: rapid fire works on".into(), on: true }
                };
                notifier.show_hud(&hud, true);
            }
            let left = seconds - start.elapsed().as_secs() as u32;
            if left != last_left {
                last_left = left;
                let _ = app.emit_to("main", "cursor-test", serde_json::json!({ "left": left, "visible": visible }));
            }
            std::thread::sleep(std::time::Duration::from_millis(40));
        }
        let _ = app.emit_to("main", "cursor-test", serde_json::json!({ "left": 0, "visible": last.unwrap_or(false) }));
        CURSOR_TEST.store(false, Ordering::SeqCst);
    });
}

/// Quit completely (Home offers it when a game that flags macro tools is in front).
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn test_sound(st: State<AppState>, on: bool) {
    st.notifier.test_sound(on);
}

#[tauri::command]
pub fn preview_hud(st: State<AppState>) {
    st.notifier.show_hud(&Hud { text: "Auto-clicker on".into(), on: true }, true);
}
