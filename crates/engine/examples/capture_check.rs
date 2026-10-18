//! Live check of key capture ("press a key to assign") through the real hook.
//!
//!   cargo run -p macroforge-engine --example capture_check --release

#[cfg(windows)]
fn main() {
    use std::sync::Arc;
    use std::time::Duration;

    use macroforge_engine::model::Data;
    use macroforge_engine::win::WinPlatform;
    use macroforge_engine::{Engine, Hud, MonitorEvent, Notifier, Status};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;

    struct Quiet;
    impl Notifier for Quiet {
        fn status(&self, _: &Status) {}
        fn hud(&self, _: &Hud) {}
        fn monitor(&self, _: &[MonitorEvent]) {}
        fn recorded(&self, _: usize) {}
    }
    let mut data = Data::default();
    data.settings.ignore_foreign_injected = false; // our test input counts as "you"
    let e = Engine::start(data, Arc::new(WinPlatform::new()), Arc::new(Quiet));
    std::thread::sleep(Duration::from_millis(300));

    let send = |inputs: Vec<INPUT>| unsafe {
        SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
    };
    let key = |vk: u16, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 } },
    };
    let mouse = |flags: u32, data: i32| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 { mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: data as u32, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    };

    let mut ok = true;
    let mut case = |what: &str, inputs: Vec<INPUT>, expect: Option<(u16, u8)>| {
        let h = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(250));
            send(inputs);
        });
        let got = e.capture(Duration::from_millis(1500));
        h.join().unwrap();
        let pass = got == expect;
        ok &= pass;
        println!("{} {what}: got {:?}", if pass { "PASS" } else { "FAIL" }, got);
        std::thread::sleep(Duration::from_millis(100));
    };
    case("key F13", vec![key(0x7C, false), key(0x7C, true)], Some((0x7C, 0)));
    case("Ctrl + F14", vec![key(0xA2, false), key(0x7D, false), key(0x7D, true), key(0xA2, true)], Some((0x7D, 1)));
    case("Mouse 4", vec![mouse(MOUSEEVENTF_XDOWN, 1), mouse(MOUSEEVENTF_XUP, 1)], Some((259, 0)));
    case("Mouse 5", vec![mouse(MOUSEEVENTF_XDOWN, 2), mouse(MOUSEEVENTF_XUP, 2)], Some((260, 0)));
    case("Left click", vec![mouse(MOUSEEVENTF_LEFTDOWN, 0), mouse(MOUSEEVENTF_LEFTUP, 0)], Some((256, 0)));
    case("Right click", vec![mouse(MOUSEEVENTF_RIGHTDOWN, 0), mouse(MOUSEEVENTF_RIGHTUP, 0)], Some((257, 0)));
    case("Middle click", vec![mouse(MOUSEEVENTF_MIDDLEDOWN, 0), mouse(MOUSEEVENTF_MIDDLEUP, 0)], Some((258, 0)));
    e.shutdown();
    println!("{}", if ok { "CAPTURE CHECK PASSED" } else { "CAPTURE CHECK FAILED" });
}

#[cfg(not(windows))]
fn main() {}
