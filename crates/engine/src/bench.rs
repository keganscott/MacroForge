//! Timing self-test for the Performance view: how close to the requested
//! time does a wait actually end? Measured on this PC, nothing assumed.

use serde::Serialize;

use crate::timing::{now_ms, Cancel, Waiter};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BenchRow {
    pub label: String,
    pub target_ms: f64,
    pub samples: usize,
    /// How late the wait ended, in microseconds.
    pub mean_late_us: f64,
    pub p99_late_us: f64,
    pub max_late_us: f64,
}

pub fn measure(label: &str, waiter: &mut dyn Waiter, target_ms: f64, samples: usize) -> BenchRow {
    let cancel = Cancel::new();
    let mut late = Vec::with_capacity(samples);
    for _ in 0..samples {
        let deadline = now_ms() + target_ms;
        waiter.wait_until(deadline, &cancel);
        late.push(((now_ms() - deadline) * 1000.0).max(0.0));
    }
    late.sort_by(|a, b| a.total_cmp(b));
    let n = late.len().max(1);
    BenchRow {
        label: label.to_string(),
        target_ms,
        samples,
        mean_late_us: late.iter().sum::<f64>() / n as f64,
        p99_late_us: late.get(((n - 1) as f64 * 0.99) as usize).copied().unwrap_or(0.0),
        max_late_us: late.last().copied().unwrap_or(0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timing::SpinWaiter;

    #[test]
    fn measures_something_sane() {
        let mut w = SpinWaiter { spin_ms: 2.0 };
        let r = measure("spin", &mut w, 1.0, 20);
        assert_eq!(r.samples, 20);
        assert!(r.mean_late_us < 2000.0);
        assert!(r.max_late_us >= r.p99_late_us);
    }
}
