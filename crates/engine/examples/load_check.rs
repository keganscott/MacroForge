//! The whole engine under heavy CPU load: hold F13 to rapid-fire F14
//! (keys almost nothing uses), ten presses, every core busy. Reports the
//! time from press to first output and the rapid-fire rhythm.
//!
//!   cargo run -p macroforge-engine --example load_check --release

#[cfg(windows)]
fn main() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use macroforge_engine::model::{Action, Binding, Data, Trigger, TriggerMode};
    use macroforge_engine::win::WinPlatform;
    use macroforge_engine::{Engine, Hud, MonitorEvent, Notifier, Status};

    struct Quiet;
    impl Notifier for Quiet {
        fn status(&self, _: &Status) {}
        fn hud(&self, _: &Hud) {}
        fn monitor(&self, _: &[MonitorEvent]) {}
        fn recorded(&self, _: usize) {}
    }

    let mut data = Data::default();
    data.settings.ignore_foreign_injected = false;
    data.profiles[0].bindings.push(Binding {
        id: "r".into(),
        trigger: Trigger { input: 0x7C, mode: TriggerMode::Hold, ..Default::default() },
        action: Action::Rapid { output: 0x7D, rate: 15.0, hold_ms: 0.0, jitter_pct: 0.0 },
        ..Default::default()
    });
    let engine = Engine::start(data, Arc::new(WinPlatform::new()), Arc::new(Quiet));
    std::thread::sleep(Duration::from_millis(300));

    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
    let busy = Arc::new(AtomicBool::new(true));
    let load: Vec<_> = (0..cores)
        .map(|_| {
            let b = busy.clone();
            std::thread::spawn(move || {
                unsafe {
                    use windows_sys::Win32::System::Threading::*;
                    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
                }
                let mut x = 0u64;
                while b.load(Ordering::Relaxed) {
                    x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
                    std::hint::black_box(x);
                }
            })
        })
        .collect();
    std::thread::sleep(Duration::from_millis(200));
    engine.reset_stats();

    let key = |up: bool| unsafe {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
        let i = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: 0x7C, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 } },
        };
        SendInput(1, &i, std::mem::size_of::<INPUT>() as i32);
    };
    // Press and hold for 0.6 s, ten times.
    for _ in 0..10 {
        key(false);
        std::thread::sleep(Duration::from_millis(600));
        key(true);
        std::thread::sleep(Duration::from_millis(150));
    }
    busy.store(false, Ordering::Relaxed);
    for t in load {
        t.join().unwrap();
    }
    let s = engine.stats();
    println!("{cores} cores fully loaded at above-normal priority; 10 holds of 0.6 s at 15/s");
    println!(
        "press -> first output: samples={} p50={:.0}us p99={:.0}us max={:.0}us",
        s.latency_samples, s.latency_p50_us, s.latency_p99_us, s.latency_max_us
    );
    println!(
        "rhythm (last hold): presses={} target={:.1}ms hold={:.1}ms late p50={:.1}us p99={:.1}us max={:.1}us",
        s.rapid_presses, s.rapid_target_ms, s.rapid_hold_ms, s.rapid_late_p50_us, s.rapid_late_p99_us, s.rapid_late_max_us
    );
    println!("hook: events={} avg={:.2}us max={:.1}us  send failures={}", s.hook_events, s.hook_avg_us, s.hook_max_us, s.send_failures);
    engine.shutdown();
}

#[cfg(not(windows))]
fn main() {}
