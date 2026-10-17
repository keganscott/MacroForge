//! Live check on a real Windows PC: real hooks, real SendInput, real timer.
//! Remaps F13 -> F14 (keys almost nothing uses), injects F13 a few times as
//! "another program", and reports what the engine saw. Then measures waits.
//!
//!   cargo run -p macroforge-engine --example live_check --release

#[cfg(windows)]
fn main() {
    use std::sync::Arc;
    use std::time::Duration;

    use macroforge_engine::bench;
    use macroforge_engine::model::{Action, Binding, Data, TimingMode, Trigger};
    use macroforge_engine::win::{timer::HiResWaiter, WinPlatform};
    use macroforge_engine::{Engine, Hud, MonitorEvent, Notifier, Status};
    use parking_lot::Mutex;

    #[derive(Default)]
    struct Log(Mutex<Vec<MonitorEvent>>);
    impl Notifier for Log {
        fn status(&self, _: &Status) {}
        fn hud(&self, _: &Hud) {}
        fn monitor(&self, e: &[MonitorEvent]) {
            self.0.lock().extend_from_slice(e);
        }
        fn recorded(&self, _: usize) {}
    }

    let mut data = Data::default();
    data.settings.ignore_foreign_injected = false; // our test injection counts as input
    data.settings.armed_on_launch = true;
    data.profiles[0].bindings.push(Binding {
        id: "f13".into(),
        trigger: Trigger { input: 0x7C, ..Default::default() },
        action: Action::Remap { output: 0x7D, mods: 0 },
        ..Default::default()
    });
    let log = Arc::new(Log::default());
    let engine = Engine::start(data, Arc::new(WinPlatform::new()), log.clone());
    engine.set_monitor(true);
    std::thread::sleep(Duration::from_millis(300));
    let st = engine.status();
    println!("hooks: keyboard={} mouse={}  armed={} live_bindings={}", st.hook.keyboard, st.hook.mouse, st.armed, st.live_bindings);

    // Inject F13 as a foreign program would (no MacroForge tag).
    // Untagged events, so the hook treats them as another program's input.
    for _ in 0..20 {
        unsafe {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
            let mk = |up: bool| INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: 0x7C, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 } },
            };
            let ins = [mk(false), mk(true)];
            SendInput(2, ins.as_ptr(), std::mem::size_of::<INPUT>() as i32);
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    std::thread::sleep(Duration::from_millis(300));
    let stats = engine.stats();
    let seen = log.0.lock().iter().filter(|e| e.input == 0x7C && e.down).count();
    println!("F13 presses seen by hook: {seen}/20");
    println!(
        "hook events={} avg={:.2}us max={:.1}us | remap latency samples={} p50={:.0}us p99={:.0}us max={:.0}us | send failures={}",
        stats.hook_events, stats.hook_avg_us, stats.hook_max_us, stats.latency_samples, stats.latency_p50_us, stats.latency_p99_us, stats.latency_max_us, stats.send_failures
    );
    engine.shutdown();

    macroforge_engine::win::sys::raise_thread_priority(false);
    for (mode, name) in [(TimingMode::Precise, "Precise"), (TimingMode::Efficient, "Efficient")] {
        let mut w = HiResWaiter::new(mode);
        println!("{name}: high-res timer available = {}", w.high_res);
        for target in [1.0, 5.0, 16.7] {
            let r = bench::measure(name, &mut w, target, 60);
            println!("  {target:>5} ms: late avg {:>7.1}us  p99 {:>7.1}us  max {:>7.1}us", r.mean_late_us, r.p99_late_us, r.max_late_us);
        }
    }
    let ok = seen >= 18 && stats.latency_samples >= 18 && stats.send_failures == 0;
    println!("{}", if ok { "LIVE CHECK PASSED" } else { "LIVE CHECK FAILED" });
    std::process::exit(if ok { 0 } else { 1 });
}

#[cfg(not(windows))]
fn main() {
    println!("Windows only");
}
