//! How long from "start rapid fire" to the first press, while every core is
//! busy? Fresh thread per run (the old way) vs a parked, ready thread.
//!
//!   cargo run -p macroforge-engine --example start_check --release

#[cfg(windows)]
fn main() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use macroforge_engine::timing::now_ms;
    use macroforge_engine::win::sys;

    fn report(label: &str, mut v: Vec<f64>) {
        v.sort_by(|a, b| a.total_cmp(b));
        let p = |q: f64| v[((v.len() - 1) as f64 * q) as usize];
        println!("{label:<36} p50={:>8.1}us  p90={:>9.1}us  max={:>9.1}us", p(0.5), p(0.9), v.last().unwrap());
    }

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
    // The requester is the engine thread: time-critical in both cases.
    sys::raise_thread_priority(true);
    println!("{cores} cores fully loaded at above-normal priority; 40 starts each");

    let mut fresh = Vec::new();
    for _ in 0..40 {
        let t0 = now_ms();
        let h = std::thread::spawn(move || {
            sys::raise_thread_priority(true);
            now_ms() - t0
        });
        fresh.push(h.join().unwrap() * 1000.0);
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    report("fresh thread per run (old)", fresh);

    let (tx, rx) = crossbeam_channel::unbounded::<f64>();
    let (back, done) = crossbeam_channel::unbounded::<f64>();
    let parked = std::thread::spawn(move || {
        sys::raise_thread_priority(true);
        for t0 in rx {
            let _ = back.send(now_ms() - t0);
        }
    });
    std::thread::sleep(std::time::Duration::from_millis(50));
    let mut pool = Vec::new();
    for _ in 0..40 {
        tx.send(now_ms()).unwrap();
        pool.push(done.recv().unwrap() * 1000.0);
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    drop(tx);
    parked.join().unwrap();
    report("parked time-critical thread (new)", pool);

    busy.store(false, Ordering::Relaxed);
    for t in load {
        t.join().unwrap();
    }
}

#[cfg(not(windows))]
fn main() {}
