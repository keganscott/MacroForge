// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
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

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
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
    let loaded = store::load(&dir);

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
            for cfg in app.config().app.windows.clone() {
                tauri::WebviewWindowBuilder::from_config(app.handle(), &cfg)?.build()?;
            }

            #[cfg(windows)]
            if let Some(hud) = app.get_webview_window("hud") {
                let _ = hud.set_ignore_cursor_events(true);
                if let Ok(h) = hud.hwnd() {
                    shell::make_overlay(h.0 as _);
                    notifier.set_hud_hwnd(h.0 as isize);
                }
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
            if let WindowEvent::CloseRequested { api, .. } = event {
                let st = window.state::<AppState>();
                if st.data.lock().settings.close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
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
        if let RunEvent::Exit = event {
            // Let go of every key and remove the hooks before the process ends.
            if let Some(st) = app.try_state::<AppState>() {
                st.engine.shutdown();
            }
        }
    });
}
