// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
#[cfg(windows)]
mod hud;
mod notify;
#[cfg(windows)]
mod shell;

use std::path::PathBuf;
use std::sync::Arc;

use macroforge_engine::{store, Data, Engine};
use parking_lot::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, RunEvent, WindowEvent};

pub struct AppState {
    pub engine: Arc<Engine>,
    pub data: Mutex<Data>,
    pub dir: PathBuf,
    pub warning: Mutex<Option<String>>,
    pub notifier: Arc<notify::UiNotifier>,
}

/// Show the main window, building it first if it was released to the tray.
fn show_main(app: &tauri::AppHandle) {
    let w = match app.get_webview_window("main") {
        Some(w) => Some(w),
        None => app
            .config()
            .app
            .windows
            .iter()
            .find(|c| c.label == "main")
            .and_then(|cfg| tauri::WebviewWindowBuilder::from_config(app, cfg).ok())
            .and_then(|b| b.build().ok()),
    };
    if let Some(w) = w {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let minimized_arg = args.iter().any(|a| a == "--minimized");
    #[cfg(windows)]
    let Some(_instance) = shell::single_instance(args.iter().any(|a| a == "--relaunch")) else {
        return;
    };

    let dir = store::default_dir();
    let mut loaded = store::load(&dir);
    // A tray hand-off (below) passes the on / off state along.
    if let Some(a) = args.iter().find_map(|a| a.strip_prefix("--armed=")) {
        loaded.data.settings.armed_on_launch = a == "1";
    }

    let app = tauri::Builder::default()
        .setup(move |app| {
            let handle = app.handle().clone();
            let notifier = Arc::new(notify::UiNotifier::new(handle.clone(), &loaded.data.settings));
            #[cfg(windows)]
            let platform = Arc::new(macroforge_engine::win::WinPlatform::new());
            let engine = Arc::new(Engine::start(loaded.data.clone(), platform, notifier.clone()));
            let start_hidden = minimized_arg || loaded.data.settings.start_minimized;

            // Tray: open, arm / disarm, stop everything, quit.
            let open = MenuItem::with_id(app, "open", "Open MacroForge", true, None::<&str>)?;
            let armed = CheckMenuItem::with_id(app, "armed", "Bindings on", true, loaded.data.settings.armed_on_launch, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop everything", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open, &armed, &stop, &sep, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("MacroForge")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| {
                    let st = app.state::<AppState>();
                    match ev.id().as_ref() {
                        "open" => show_main(app),
                        "armed" => st.engine.set_armed(None),
                        "stop" => st.engine.panic(),
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            notifier.set_tray(tray.build(app)?, armed, loaded.data.settings.armed_on_launch);

            // State first, windows second: a page that loads before the state
            // exists gets "state not managed" from its first command. The
            // windows are declared with `create: false` and built here.
            app.manage(AppState {
                engine,
                data: Mutex::new(loaded.data.clone()),
                dir: dir.clone(),
                warning: Mutex::new(loaded.warning.clone()),
                notifier: notifier.clone(),
            });
            // The window is built only when it is shown (create: false in
            // the config), so starting in the tray costs no browser at all.
            #[cfg(windows)]
            {
                let h = handle.clone();
                shell::wait_for_open(move || {
                    let h2 = h.clone();
                    let _ = h.run_on_main_thread(move || show_main(&h2));
                });
            }
            if !start_hidden {
                show_main(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            // Closing to the tray hands over to a fresh tray-only copy of
            // MacroForge and exits. WebView2 keeps its browser, GPU and
            // renderer processes for the life of the process that opened a
            // window (~200 MB measured, tools/measure.ps1), while a copy that
            // never opens one is a single ~3 MB process. The hand-off takes
            // about half a second; on / off carries over. If it cannot start,
            // the window is just released.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let st = window.state::<AppState>();
                if !st.data.lock().settings.close_to_tray {
                    app.exit(0);
                    return;
                }
                if cfg!(not(debug_assertions)) {
                    let armed = st.engine.status().armed;
                    if let Ok(exe) = std::env::current_exe() {
                        let spawned = std::process::Command::new(exe)
                            .args(["--minimized", "--relaunch", if armed { "--armed=1" } else { "--armed=0" }])
                            .spawn();
                        if spawned.is_ok() {
                            api.prevent_close();
                            app.exit(0);
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::save_data,
            commands::set_armed,
            commands::panic_stop,
            commands::capture_input,
            commands::cancel_capture,
            commands::record_start,
            commands::record_stop,
            commands::play_steps,
            commands::stop_run,
            commands::set_monitor,
            commands::get_status,
            commands::get_stats,
            commands::reset_stats,
            commands::run_benchmark,
            commands::list_apps,
            commands::relaunch_admin,
            commands::open_data_dir,
            commands::preview_hud,
            commands::test_sound,
            commands::quit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MacroForge");

    app.run(|app, event| {
        // The last window closing is not quitting when MacroForge lives in
        // the tray; Quit (an explicit exit code) still quits.
        if let RunEvent::ExitRequested { code: None, api, .. } = &event {
            if let Some(st) = app.try_state::<AppState>() {
                if st.data.lock().settings.close_to_tray {
                    api.prevent_exit();
                    return;
                }
            }
        }
        if let RunEvent::Exit = event {
            // Let go of every key and remove the hooks before the process ends.
            if let Some(st) = app.try_state::<AppState>() {
                st.engine.shutdown();
            }
        }
    });
}
