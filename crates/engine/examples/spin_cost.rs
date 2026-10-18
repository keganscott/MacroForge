//! CPU used by a run while rapid fire is going, per timing mode: 15 presses
//! a second for 10 s into a null output, thread CPU time from Windows.
//!
//!   cargo run -p macroforge-engine --example spin_cost --release

#[cfg(windows)]
fn main() {
    use std::sync::Arc;

    use macroforge_engine::input::Input;
    use macroforge_engine::model::TimingMode;
    use macroforge_engine::runner::{run_rapid, Ctx, Output};
    use macroforge_engine::timing::{now_ms, Cancel, Rng};
    use macroforge_engine::win::{sys, timer::HiResWaiter};
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::System::Threading::{GetCurrentThread, GetThreadTimes};

    struct Null;
    impl Output for Null {
        fn input(&self, _: Input, _: bool) {}
        fn wheel(&self, _: i32, _: bool) {}
        fn move_rel(&self, _: i32, _: i32) {}
        fn move_to(&self, _: i32, _: i32) {}
        fn text(&self, _: char) {}
    }
    fn cpu_ms() -> f64 {
        let z = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
        let (mut a, mut b, mut k, mut u) = (z, z, z, z);
        unsafe { GetThreadTimes(GetCurrentThread(), &mut a, &mut b, &mut k, &mut u) };
        let f = |t: FILETIME| ((t.dwHighDateTime as u64) << 32 | t.dwLowDateTime as u64) as f64 / 10_000.0;
        f(k) + f(u)
    }
    for (mode, name) in [(TimingMode::Precise, "Precise"), (TimingMode::Efficient, "Efficient")] {
        let cancel = Arc::new(Cancel::new());
        let c2 = cancel.clone();
        let h = std::thread::spawn(move || {
            sys::raise_thread_priority(true);
            let mut w = HiResWaiter::new(mode);
            let mut late = Vec::new();
            let c0 = cpu_ms();
            let mut cx = Ctx { waiter: &mut w, cancel: &c2, rng: Rng::new(1), t: now_ms() };
            run_rapid(256, 15.0, 0.0, 0.0, &Null, &mut cx, &mut |l| late.push(l * 1000.0), &|| true);
            (cpu_ms() - c0, late)
        });
        std::thread::sleep(std::time::Duration::from_secs(10));
        cancel.stop();
        let (cpu, mut late) = h.join().unwrap();
        late.sort_by(|a, b| a.total_cmp(b));
        let p = |q: f64| late[((late.len() - 1) as f64 * q) as usize];
        println!(
            "{name:<9} cpu={cpu:>6.1} ms in 10 s ({:.2} % of one core)  presses={}  late p50={:.1}us p99={:.1}us max={:.1}us",
            cpu / 100.0,
            late.len(),
            p(0.5),
            p(0.99),
            late.last().unwrap()
        );
    }
}

#[cfg(not(windows))]
fn main() {}
