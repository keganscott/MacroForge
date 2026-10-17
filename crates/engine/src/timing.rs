//! Time, waiting and cancellation.
//!
//! All scheduling is on absolute deadlines in milliseconds since the engine
//! started (`now_ms`), so a long macro never drifts: each step's deadline is
//! the previous deadline plus its delay, not "now" plus its delay.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

fn epoch() -> Instant {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    *EPOCH.get_or_init(Instant::now)
}

/// Milliseconds since the engine started. `Instant` is QueryPerformanceCounter
/// on Windows, so this has sub-microsecond resolution.
pub fn now_ms() -> f64 {
    epoch().elapsed().as_secs_f64() * 1000.0
}

/// A stop request for one running action. `stop` ends it as soon as possible
/// (mid-wait); `finish` lets it complete its current pass first.
pub struct Cancel {
    stop: AtomicBool,
    finish: AtomicBool,
    #[cfg(windows)]
    event: crate::win::Event,
}

impl Default for Cancel {
    fn default() -> Self {
        Self::new()
    }
}

impl Cancel {
    pub fn new() -> Self {
        Cancel {
            stop: AtomicBool::new(false),
            finish: AtomicBool::new(false),
            #[cfg(windows)]
            event: crate::win::Event::new(),
        }
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        #[cfg(windows)]
        self.event.set();
    }

    pub fn finish(&self) {
        self.finish.store(true, Ordering::SeqCst);
    }

    pub fn is_stopped(&self) -> bool {
        self.stop.load(Ordering::Relaxed)
    }

    pub fn is_finishing(&self) -> bool {
        self.finish.load(Ordering::Relaxed) || self.is_stopped()
    }

    #[cfg(windows)]
    pub(crate) fn event(&self) -> &crate::win::Event {
        &self.event
    }
}

/// Sleeps until an absolute deadline. Returns `true` if it was cancelled.
pub trait Waiter: Send {
    fn wait_until(&mut self, deadline_ms: f64, cancel: &Cancel) -> bool;
}

/// Portable waiter: thread sleep, then a spin for the last stretch. Used by
/// tests and non-Windows builds; Windows uses `win::timer::HiResWaiter`.
pub struct SpinWaiter {
    pub spin_ms: f64,
}

impl Waiter for SpinWaiter {
    fn wait_until(&mut self, deadline_ms: f64, cancel: &Cancel) -> bool {
        loop {
            if cancel.is_stopped() {
                return true;
            }
            let left = deadline_ms - now_ms();
            if left <= 0.0 {
                return false;
            }
            if left > self.spin_ms + 1.0 {
                let chunk = (left - self.spin_ms).min(5.0);
                std::thread::sleep(std::time::Duration::from_secs_f64(chunk / 1000.0));
            } else {
                std::hint::spin_loop();
            }
        }
    }
}

/// Small, fast, deterministic PRNG (xorshift64*) for delay jitter. Not for
/// anything security related.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed.max(1))
    }

    pub fn from_time() -> Self {
        let t = epoch().elapsed().as_nanos() as u64 ^ 0x9E37_79B9_7F4A_7C15;
        Rng::new(t.wrapping_mul(0x2545_F491_4F6C_DD1D))
    }

    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform in [0, 1).
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    /// Uniform in [-amount, amount].
    pub fn spread(&mut self, amount: f64) -> f64 {
        if amount <= 0.0 {
            0.0
        } else {
            (self.unit() * 2.0 - 1.0) * amount
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rng_stays_in_range() {
        let mut r = Rng::new(42);
        for _ in 0..10_000 {
            let u = r.unit();
            assert!((0.0..1.0).contains(&u));
            let s = r.spread(3.0);
            assert!((-3.0..=3.0).contains(&s));
        }
        assert_eq!(r.spread(0.0), 0.0);
    }

    #[test]
    fn spin_waiter_hits_deadline_and_cancels() {
        let mut w = SpinWaiter { spin_ms: 1.0 };
        let c = Cancel::new();
        let target = now_ms() + 8.0;
        assert!(!w.wait_until(target, &c));
        let late = now_ms() - target;
        assert!((0.0..5.0).contains(&late), "late by {late} ms");
        c.stop();
        assert!(w.wait_until(now_ms() + 1000.0, &c));
    }
}
