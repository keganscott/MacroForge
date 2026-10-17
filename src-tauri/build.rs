/// Commands the webview may call. Each also needs `allow-<name>` in
/// `capabilities/main.json`; a registered command not listed here cannot be
/// invoked at all.
const COMMANDS: &[&str] = &[
    "get_snapshot",
    "save_data",
    "set_armed",
    "panic_stop",
    "capture_input",
    "cancel_capture",
    "record_start",
    "record_stop",
    "play_steps",
    "stop_run",
    "set_monitor",
    "get_status",
    "get_stats",
    "reset_stats",
    "run_benchmark",
    "list_apps",
    "relaunch_admin",
    "open_data_dir",
    "preview_hud",
    "test_sound",
    "quit_app",
];

fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
