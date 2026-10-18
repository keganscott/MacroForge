//! How steady is rapid fire while every CPU core is busy (like a heavy game)?
//! Runs 15 clicks/s for 3 s per setup into a null output (nothing is sent)
//! and reports how late each press was against its schedule.
//!
//!   cargo run -p macroforge-engine --example rhythm_check --release

#[cfg(windows)]
fn main() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use macroforge_engine::input::Input;
    use macroforge_engine::model::TimingMode;
    use macroforge_engine::runner::{run_rapid, Ctx, Output};
    use macroforge_engine::timing::{now_ms, Cancel, Rng};
    use macroforge_engine::win::{sys, timer::HiResWaiter};

    struct Null;
    impl Output for Null {
        fn input(&self, _: Input, _: bool) {}
        fn wheel(&self, _: i32, _: bool) {}
        fn move_rel(&self, _: i32, _: i32) {}
        fn move_to(&self, _: i32, _: i32) {}
        fn text(&self, _: char) {}
    }

    fn measure(label: &str, setup: fn()) {
        let cancel = Arc::new(Cancel::new());
        let c2 = cancel.clone();
        let h = std::thread::spawn(move || {
            setup();
            let mut w = HiResWaiter::new(TimingMode::Precise);
            let mut late = Vec::new();
            let mut cx = Ctx { waiter: &mut w, cancel: &c2, rng: Rng::new(1), t: now_ms() };
            run_rapid(256, 15.0, 0.0, 0.0, &Null, &mut cx, &mut |l| late.push(l * 1000.0), &|| true);
            late
        });
        std::thread::sleep(std::time::Duration::from_secs(3));
        cancel.stop();
        let mut late = h.join().unwrap();
        late.sort_by(|a, b| a.total_cmp(b));
        let p = |q: f64| late[((late.len() - 1) as f64 * q) as usize];
        println!(
            "{label:<34} presses={:>3}  late p50={:>7.1}us  p99={:>8.1}us  max={:>8.1}us",
            late.len(),
            p(0.5),
            p(0.99),
            late.last().unwrap()
        );
    }

    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
    let busy = Arc::new(AtomicBool::new(true));
    let load: Vec<_> = (0..cores)
        .map(|_| {
            let b = busy.clone();
            std::thread::spawn(move || {
                // Above-normal like a game's render thread.
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
    println!("{cores} cores fully loaded at above-normal priority");
    measure("before: highest priority", || sys::raise_thread_priority(false));
    measure("time-critical", || sys::raise_thread_priority(true));
    measure("highest (again)", || sys::raise_thread_priority(false));
    busy.store(false, Ordering::Relaxed);
    for t in load {
        t.join().unwrap();
    }
}

#[cfg(not(windows))]
fn main() {}
