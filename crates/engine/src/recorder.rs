//! Turns recorded input into macro steps.

use crate::input::{self, Input};
use crate::model::{RecordTiming, Step};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RecEv {
    Input { input: Input, down: bool },
    Move { dx: i32, dy: i32 },
}

/// Moves closer together than this are merged into one step.
const MOVE_MERGE_MS: f64 = 12.0;

pub fn to_steps(events: &[(f64, RecEv)], timing: RecordTiming, fixed_ms: f64) -> Vec<Step> {
    // Releases whose press happened before recording started are dropped;
    // so is the press of whatever was still held when recording stopped
    // (usually the Stop hotkey or click), unless it was long enough to be
    // deliberate, in which case it gets a matching release.
    let mut down: Vec<(Input, usize)> = Vec::new();
    let mut evs: Vec<(f64, RecEv)> = Vec::with_capacity(events.len());
    for &(t, ev) in events {
        match ev {
            RecEv::Input { input, down: true } if !input::is_momentary(input) => {
                if down.iter().any(|(c, _)| *c == input) {
                    continue;
                }
                down.push((input, evs.len()));
                evs.push((t, ev));
            }
            RecEv::Input { input, down: false } => {
                let Some(pos) = down.iter().position(|(c, _)| *c == input) else { continue };
                down.remove(pos);
                evs.push((t, ev));
            }
            _ => evs.push((t, ev)),
        }
    }
    let end = events.last().map(|e| e.0).unwrap_or(0.0);
    for (input, _) in down {
        evs.push((end, RecEv::Input { input, down: false }));
    }

    // Merge nearby moves.
    let mut merged: Vec<(f64, f64, RecEv)> = Vec::new(); // (start, end, ev)
    for (t, ev) in evs {
        if let RecEv::Move { dx, dy } = ev {
            if let Some((_, last, RecEv::Move { dx: ax, dy: ay })) = merged.last_mut() {
                if t - *last <= MOVE_MERGE_MS {
                    *ax += dx;
                    *ay += dy;
                    *last = t;
                    continue;
                }
            }
        }
        merged.push((t, t, ev));
    }

    let mut steps = Vec::new();
    let mut prev_end: Option<f64> = None;
    let mut i = 0;
    while i < merged.len() {
        let (start, end, ev) = merged[i];
        if let Some(p) = prev_end {
            let gap = match timing {
                RecordTiming::Real => (start - p).round(),
                RecordTiming::Fixed => fixed_ms,
                RecordTiming::None => 0.0,
            };
            if gap >= 1.0 {
                steps.push(Step::Delay { ms: gap, jitter_ms: 0.0 });
            }
        }
        let mut done_at = end;
        match ev {
            RecEv::Move { dx, dy } => {
                let duration = if timing == RecordTiming::Real { (end - start).round() } else { 0.0 };
                steps.push(Step::Move { dx, dy, duration_ms: duration });
            }
            RecEv::Input { input, down: true } if input::is_momentary(input) => {
                let (delta, horizontal) = match input {
                    input::WHEEL_UP => (1, false),
                    input::WHEEL_DOWN => (-1, false),
                    input::WHEEL_RIGHT => (1, true),
                    _ => (-1, true),
                };
                steps.push(Step::Wheel { delta, horizontal });
            }
            RecEv::Input { input, down: true } => {
                // A press released before anything else happened is one Press step.
                match merged.get(i + 1) {
                    Some(&(t2, _, RecEv::Input { input: i2, down: false })) if i2 == input => {
                        let hold = if timing == RecordTiming::Real { (t2 - start).round().max(1.0) } else { 15.0 };
                        steps.push(Step::Press { input, hold_ms: hold });
                        done_at = t2;
                        i += 1;
                    }
                    _ => steps.push(Step::Down { input }),
                }
            }
            RecEv::Input { input, down: false } => steps.push(Step::Up { input }),
        }
        prev_end = Some(done_at);
        i += 1;
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    fn k(input: Input, down: bool) -> RecEv {
        RecEv::Input { input, down }
    }

    #[test]
    fn taps_become_presses_with_real_gaps() {
        let evs = [(0.0, k(0x41, true)), (20.0, k(0x41, false)), (120.0, k(0x42, true)), (130.0, k(0x42, false))];
        assert_eq!(
            to_steps(&evs, RecordTiming::Real, 0.0),
            vec![
                Step::Press { input: 0x41, hold_ms: 20.0 },
                Step::Delay { ms: 100.0, jitter_ms: 0.0 },
                Step::Press { input: 0x42, hold_ms: 10.0 },
            ]
        );
    }

    #[test]
    fn overlapping_keys_become_down_up() {
        let evs = [(0.0, k(0xA2, true)), (10.0, k(0x43, true)), (20.0, k(0x43, false)), (30.0, k(0xA2, false))];
        assert_eq!(
            to_steps(&evs, RecordTiming::None, 0.0),
            vec![Step::Down { input: 0xA2 }, Step::Press { input: 0x43, hold_ms: 15.0 }, Step::Up { input: 0xA2 }]
        );
    }

    #[test]
    fn stray_releases_dropped_and_held_keys_released() {
        let evs = [(0.0, k(0x41, false)), (5.0, k(0x57, true)), (50.0, k(0x44, true)), (60.0, k(0x44, false))];
        let steps = to_steps(&evs, RecordTiming::Fixed, 25.0);
        assert_eq!(
            steps,
            vec![
                Step::Down { input: 0x57 },
                Step::Delay { ms: 25.0, jitter_ms: 0.0 },
                Step::Press { input: 0x44, hold_ms: 15.0 },
                Step::Delay { ms: 25.0, jitter_ms: 0.0 },
                Step::Up { input: 0x57 },
            ]
        );
    }

    #[test]
    fn moves_merge() {
        let evs = [
            (0.0, RecEv::Move { dx: 1, dy: 0 }),
            (5.0, RecEv::Move { dx: 2, dy: 1 }),
            (10.0, RecEv::Move { dx: 3, dy: 1 }),
            (100.0, RecEv::Move { dx: -1, dy: 0 }),
        ];
        assert_eq!(
            to_steps(&evs, RecordTiming::Real, 0.0),
            vec![
                Step::Move { dx: 6, dy: 2, duration_ms: 10.0 },
                Step::Delay { ms: 90.0, jitter_ms: 0.0 },
                Step::Move { dx: -1, dy: 0, duration_ms: 0.0 },
            ]
        );
    }
}
