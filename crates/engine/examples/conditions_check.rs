//! Live check of "Only while aiming" and "Pause in menus" with the real
//! hook and SendInput, on keys almost nothing uses: F13 = trigger,
//! F15 = the "aim" button, F14 = what rapid fire sends.
//!
//!   cargo run -p macroforge-engine --example conditions_check --release

#[cfg(windows)]
fn main() {
    use std::sync::Arc;
    use std::time::Duration;

    use macroforge_engine::model::{Action, Binding, Conditions, Data, Trigger, TriggerMode};
    use macroforge_engine::win::{sys, WinPlatform};
    use macroforge_engine::{Engine, Hud, MonitorEvent, Notifier, Status};

    struct Quiet;
    impl Notifier for Quiet {
        fn status(&self, _: &Status) {}
        fn hud(&self, _: &Hud) {}
        fn monitor(&self, _: &[MonitorEvent]) {}
        fn recorded(&self, _: usize) {}
    }
    let key = |vk: u16, up: bool| unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
        let i = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 } },
        };
        SendInput(1, &i, std::mem::size_of::<INPUT>() as i32);
    };
    let ms = |n: u64| std::thread::sleep(Duration::from_millis(n));

    let run = |conditions: Conditions| {
        let mut data = Data::default();
        data.settings.ignore_foreign_injected = false;
        data.profiles[0].bindings.push(Binding {
            id: "r".into(),
            trigger: Trigger { input: 0x7C, mode: TriggerMode::Hold, ..Default::default() },
            action: Action::Rapid { output: 0x7D, rate: 20.0, hold_ms: 0.0, jitter_pct: 0.0 },
            conditions,
            ..Default::default()
        });
        let e = Engine::start(data, Arc::new(WinPlatform::new()), Arc::new(Quiet));
        ms(300);
        e
    };
    let mut ok = true;
    let mut check = |what: &str, pass: bool, detail: String| {
        println!("{} {what}: {detail}", if pass { "PASS" } else { "FAIL" });
        ok &= pass;
    };

    // ---- Only while aiming (F15 held)
    let e = run(Conditions { while_held: 0x7E, pause_in_menus: false });
    e.reset_stats();
    key(0x7C, false);
    ms(400);
    key(0x7C, true);
    ms(150);
    let s = e.stats();
    check("not aiming: trigger works normally", s.rapid_presses == 0, format!("{} rapid presses", s.rapid_presses));

    key(0x7E, false); // aim
    ms(50);
    key(0x7C, false);
    ms(400);
    let firing = e.stats().rapid_presses;
    check("aiming: rapid fire", (6..=10).contains(&firing), format!("{firing} presses in 0.4 s at 20/s"));

    key(0x7E, true); // let go of aim, trigger still held
    ms(60);
    let at_release = e.stats().rapid_presses;
    ms(400);
    let after = e.stats().rapid_presses;
    check("aim released mid-burst: stops", after == at_release, format!("{} more presses after letting go", after - at_release));
    key(0x7C, true);
    ms(100);
    e.shutdown();

    // ---- Pause in menus (cursor showing)
    let visible = sys::cursor_visible();
    println!("cursor is {} right now", if visible { "showing (desktop)" } else { "hidden" });
    let e = run(Conditions { while_held: 0, pause_in_menus: true });
    e.reset_stats();
    key(0x7C, false);
    ms(400);
    key(0x7C, true);
    ms(150);
    let presses = e.stats().rapid_presses;
    if visible {
        check("cursor showing: trigger works normally", presses == 0, format!("{presses} rapid presses"));
    } else {
        check("cursor hidden: rapid fire", presses >= 6, format!("{presses} rapid presses"));
    }
    // Gameplay: games pin the cursor while you mouse-look. Pin it to one
    // pixel for half a second (as a game would) and fire again.
    unsafe {
        use windows_sys::Win32::Foundation::{POINT, RECT};
        use windows_sys::Win32::UI::WindowsAndMessaging::{ClipCursor, GetCursorPos};
        let mut p = POINT { x: 0, y: 0 };
        GetCursorPos(&mut p);
        ClipCursor(&RECT { left: p.x, top: p.y, right: p.x + 1, bottom: p.y + 1 });
    }
    let hidden = !sys::cursor_visible();
    e.reset_stats();
    key(0x7C, false);
    ms(400);
    key(0x7C, true);
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::ClipCursor(std::ptr::null()) };
    ms(150);
    let presses = e.stats().rapid_presses;
    check("cursor pinned (gameplay): seen as hidden", hidden, format!("cursor_visible() = {}", !hidden));
    check("cursor pinned (gameplay): rapid fire", presses >= 6, format!("{presses} rapid presses"));
    e.shutdown();
    println!("{}", if ok { "CONDITIONS CHECK PASSED" } else { "CONDITIONS CHECK FAILED" });
    std::process::exit(if ok { 0 } else { 1 });
}

#[cfg(not(windows))]
fn main() {}
