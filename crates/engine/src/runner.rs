//! Plays actions: macro steps and rapid fire. Platform independent: output
//! goes through `Output` and waiting through `Waiter`, so the same code is
//! tested here with a recording output and runs on Windows with SendInput.
//!
//! Safety rule: everything a run presses, it lets go of. `Held` tracks what
//! is down, and every exit path (end, stop, panic unwinding) releases it.

use crate::input::{self, Input};
use crate::model::{Repress, Step, TriggerMode};
use crate::timing::{now_ms, Cancel, Rng, Waiter};

/// Where synthetic input goes.
pub trait Output: Send + Sync {
    /// Press or release a key / mouse button. Wheel codes send one notch on `down`.
    fn input(&self, code: Input, down: bool);
    fn wheel(&self, notches: i32, horizontal: bool);
    fn move_rel(&self, dx: i32, dy: i32);
    fn move_to(&self, x: i32, y: i32);
    /// Type one character (Unicode key event, down and up).
    fn text(&self, ch: char);
}

/// Keys and buttons a run currently holds down.
pub struct Held<'a> {
    out: &'a dyn Output,
    down: Vec<Input>,
}

impl<'a> Held<'a> {
    pub fn new(out: &'a dyn Output) -> Self {
        Held { out, down: Vec::new() }
    }

    pub fn press(&mut self, code: Input) {
        if input::is_momentary(code) {
            self.out.input(code, true);
            return;
        }
        if !self.down.contains(&code) {
            self.down.push(code);
        }
        self.out.input(code, true);
    }

    pub fn release(&mut self, code: Input) {
        if input::is_momentary(code) {
            return;
        }
        self.down.retain(|c| *c != code);
        self.out.input(code, false);
    }

    pub fn release_all(&mut self) {
        while let Some(code) = self.down.pop() {
            self.out.input(code, false);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.down.is_empty()
    }
}

impl Drop for Held<'_> {
    fn drop(&mut self) {
        self.release_all();
    }
}

/// Cursor of a run: the schedule it is on, plus its waiter and jitter source.
pub struct Ctx<'a> {
    pub waiter: &'a mut dyn Waiter,
    pub cancel: &'a Cancel,
    pub rng: Rng,
    /// The deadline the schedule has reached, in `now_ms` time.
    pub t: f64,
}

impl Ctx<'_> {
    /// Advance the schedule by `ms` and wait for it. If the run has fallen
    /// behind (a slow step), the schedule catches up to now instead of firing
    /// a burst of overdue steps. Returns `true` if cancelled.
    fn wait(&mut self, ms: f64) -> bool {
        self.t += ms.max(0.0);
        let now = now_ms();
        if self.t < now - 50.0 {
            self.t = now;
        }
        self.waiter.wait_until(self.t, self.cancel)
    }
}

/// Play `steps` once. Returns `true` if cancelled part way.
pub fn play_steps(steps: &[Step], out: &dyn Output, held: &mut Held, cx: &mut Ctx) -> bool {
    for step in steps {
        if cx.cancel.is_stopped() {
            return true;
        }
        match step {
            Step::Press { input, hold_ms } => {
                held.press(*input);
                if !input::is_momentary(*input) {
                    if cx.wait(*hold_ms) {
                        return true;
                    }
                    held.release(*input);
                }
            }
            Step::Down { input } => held.press(*input),
            Step::Up { input } => held.release(*input),
            Step::Wheel { delta, horizontal } => out.wheel(*delta, *horizontal),
            Step::Move { dx, dy, duration_ms } => {
                if *duration_ms <= 0.0 || (dx.abs() + dy.abs()) <= 1 {
                    out.move_rel(*dx, *dy);
                } else {
                    // Spread across slices of ~2 ms; carry the rounding so the
                    // total is exact.
                    let slices = ((*duration_ms / 2.0).ceil() as i32).clamp(1, 2000);
                    let per = duration_ms / slices as f64;
                    let (mut sent_x, mut sent_y) = (0i32, 0i32);
                    for i in 1..=slices {
                        let tx = (*dx as f64 * i as f64 / slices as f64).round() as i32;
                        let ty = (*dy as f64 * i as f64 / slices as f64).round() as i32;
                        if tx != sent_x || ty != sent_y {
                            out.move_rel(tx - sent_x, ty - sent_y);
                            sent_x = tx;
                            sent_y = ty;
                        }
                        if i < slices && cx.wait(per) {
                            return true;
                        }
                    }
                }
            }
            Step::MoveTo { x, y } => out.move_to(*x, *y),
            Step::Delay { ms, jitter_ms } => {
                let d = ms + cx.rng.spread(*jitter_ms);
                if cx.wait(d) {
                    return true;
                }
            }
            Step::Text { text, char_delay_ms } => {
                for (i, ch) in text.chars().enumerate() {
                    if i > 0 && cx.wait(*char_delay_ms) {
                        return true;
                    }
                    out.text(ch);
                }
            }
        }
    }
    false
}

/// How a macro run repeats.
#[derive(Clone, Copy, Debug)]
pub enum Loop {
    Times(u32),
    /// Until stopped (Hold / Toggle).
    Forever,
}

impl Loop {
    pub fn for_mode(mode: TriggerMode, repeat: u32) -> Self {
        match mode {
            TriggerMode::Press => Loop::Times(repeat.max(1)),
            TriggerMode::Hold | TriggerMode::Toggle => Loop::Forever,
        }
    }
}

/// Play a macro `lp` times. A `finish` request ends it after the current pass.
/// `ok` is checked before every pass (the binding's conditions): a counted
/// run ends when it fails; a looping one waits, keys released, until it
/// holds again.
pub fn run_macro(steps: &[Step], lp: Loop, out: &dyn Output, cx: &mut Ctx, ok: &dyn Fn() -> bool) {
    let mut held = Held::new(out);
    let mut pass = 0u32;
    loop {
        if !ok() {
            if matches!(lp, Loop::Times(_)) {
                break;
            }
            held.release_all();
            if cx.wait(10.0) {
                break;
            }
            continue;
        }
        if play_steps(steps, out, &mut held, cx) {
            break;
        }
        // A macro that leaves keys down on purpose (a Down step with no Up)
        // keeps them down between passes; they are released when the run ends.
        pass += 1;
        match lp {
            Loop::Times(n) if pass >= n => break,
            _ => {}
        }
        if cx.cancel.is_finishing() {
            break;
        }
        // A forever-loop of only instant steps would spin a core and flood
        // the game; give every pass at least 1 ms. (`all` is true for no steps.)
        let instant = steps.iter().all(|s| {
            matches!(s, Step::Down { .. } | Step::Up { .. } | Step::Wheel { .. } | Step::MoveTo { .. })
                || matches!(s, Step::Press { hold_ms, .. } if *hold_ms <= 0.0)
                || matches!(s, Step::Delay { ms, .. } if *ms <= 0.0)
        });
        if instant && cx.wait(1.0) {
            break;
        }
    }
    held.release_all();
}

/// How long each rapid-fire press is held. `hold_ms` of 0 means auto: half
/// the period, a square wave. Games that read input once per frame can miss
/// a press (or a release) shorter than a frame, and frames get longer when a
/// game is busy; an even split keeps both halves as long as possible.
pub fn rapid_hold(hold_ms: f64, period: f64) -> f64 {
    if hold_ms <= 0.0 {
        period * 0.5
    } else {
        // Leave at least a quarter of the period released, or the game sees
        // one long press instead of separate taps.
        hold_ms.min(period * 0.75)
    }
}

/// Turbo / auto-click: tap `output` at `rate` per second until stopped.
/// `on_press` gets how late (ms) each press was against its schedule.
/// `ok` is checked before every press (the binding's conditions): while it
/// fails, presses are skipped but the rhythm keeps going, so firing picks up
/// on the beat the moment it holds again.
#[allow(clippy::too_many_arguments)]
pub fn run_rapid(
    output: Input,
    rate: f64,
    hold_ms: f64,
    jitter_pct: f64,
    out: &dyn Output,
    cx: &mut Ctx,
    on_press: &mut dyn FnMut(f64),
    ok: &dyn Fn() -> bool,
) {
    let mut held = Held::new(out);
    let period = 1000.0 / rate.max(0.01);
    let hold = rapid_hold(hold_ms, period);
    let jitter = period * (jitter_pct / 100.0);
    loop {
        let start = cx.t;
        if ok() {
            on_press((now_ms() - start).max(0.0));
            held.press(output);
            if !input::is_momentary(output) {
                if hold > 0.0 && cx.wait(hold) {
                    break;
                }
                held.release(output);
            }
        }
        if cx.cancel.is_finishing() {
            break;
        }
        // Variation only ever adds to the gap, never takes away: a gap shorter
        // than the set rate could land before a gun is ready to fire again,
        // and that click would be lost (src/lib/firerate.ts).
        let next = period + cx.rng.unit() * jitter;
        let gap = (start + next.max(1.0)) - cx.t;
        if cx.wait(gap) {
            break;
        }
    }
    held.release_all();
}

/// What a press does to a binding that is already running.
pub fn on_repress(policy: Repress) -> (bool, bool) {
    // (stop the current run, start a new one)
    match policy {
        Repress::Ignore => (false, false),
        Repress::Restart => (true, true),
        Repress::Stop => (true, false),
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::timing::SpinWaiter;
    use parking_lot::Mutex;

    #[derive(Debug, Clone, PartialEq)]
    pub enum Ev {
        In(Input, bool),
        Wheel(i32, bool),
        Rel(i32, i32),
        To(i32, i32),
        Ch(char),
    }

    #[derive(Default)]
    pub struct Rec {
        pub evs: Mutex<Vec<(f64, Ev)>>,
    }

    impl Rec {
        pub fn events(&self) -> Vec<Ev> {
            self.evs.lock().iter().map(|(_, e)| e.clone()).collect()
        }
    }

    impl Output for Rec {
        fn input(&self, code: Input, down: bool) {
            self.evs.lock().push((now_ms(), Ev::In(code, down)));
        }
        fn wheel(&self, n: i32, h: bool) {
            self.evs.lock().push((now_ms(), Ev::Wheel(n, h)));
        }
        fn move_rel(&self, dx: i32, dy: i32) {
            self.evs.lock().push((now_ms(), Ev::Rel(dx, dy)));
        }
        fn move_to(&self, x: i32, y: i32) {
            self.evs.lock().push((now_ms(), Ev::To(x, y)));
        }
        fn text(&self, ch: char) {
            self.evs.lock().push((now_ms(), Ev::Ch(ch)));
        }
    }

    fn ctx<'a>(w: &'a mut SpinWaiter, c: &'a Cancel) -> Ctx<'a> {
        Ctx { waiter: w, cancel: c, rng: Rng::new(7), t: now_ms() }
    }

    #[test]
    fn plays_steps_in_order() {
        let rec = Rec::default();
        let mut w = SpinWaiter { spin_ms: 1.0 };
        let c = Cancel::new();
        let steps = vec![
            Step::Press { input: 0x41, hold_ms: 2.0 },
            Step::Delay { ms: 3.0, jitter_ms: 0.0 },
            Step::Down { input: 256 },
            Step::Up { input: 256 },
            Step::Wheel { delta: -2, horizontal: false },
            Step::Text { text: "hi".into(), char_delay_ms: 0.0 },
            Step::MoveTo { x: 5, y: 6 },
        ];
        run_macro(&steps, Loop::Times(1), &rec, &mut ctx(&mut w, &c), &|| true);
        assert_eq!(
            rec.events(),
            vec![
                Ev::In(0x41, true),
                Ev::In(0x41, false),
                Ev::In(256, true),
                Ev::In(256, false),
                Ev::Wheel(-2, false),
                Ev::Ch('h'),
                Ev::Ch('i'),
                Ev::To(5, 6),
            ]
        );
    }

    #[test]
    fn delays_follow_an_absolute_schedule() {
        let rec = Rec::default();
        let mut w = SpinWaiter { spin_ms: 2.0 };
        let c = Cancel::new();
        let steps: Vec<Step> = (0..10)
            .flat_map(|_| [Step::Press { input: 0x41, hold_ms: 0.0 }, Step::Delay { ms: 5.0, jitter_ms: 0.0 }])
            .collect();
        let start = now_ms();
        run_macro(&steps, Loop::Times(1), &rec, &mut ctx(&mut w, &c), &|| true);
        let total = now_ms() - start;
        assert!((49.0..60.0).contains(&total), "10 x 5 ms took {total} ms");
    }

    #[test]
    fn smooth_move_sums_exactly() {
        let rec = Rec::default();
        let mut w = SpinWaiter { spin_ms: 1.0 };
        let c = Cancel::new();
        run_macro(&[Step::Move { dx: 101, dy: -37, duration_ms: 10.0 }], Loop::Times(1), &rec, &mut ctx(&mut w, &c), &|| true);
        let (sx, sy) = rec.events().iter().fold((0, 0), |(x, y), e| match e {
            Ev::Rel(dx, dy) => (x + dx, y + dy),
            _ => (x, y),
        });
        assert_eq!((sx, sy), (101, -37));
        assert!(rec.events().len() > 1);
    }

    #[test]
    fn stopping_releases_everything_held() {
        let rec = std::sync::Arc::new(Rec::default());
        let c = std::sync::Arc::new(Cancel::new());
        let (r2, c2) = (rec.clone(), c.clone());
        let h = std::thread::spawn(move || {
            let mut w = SpinWaiter { spin_ms: 1.0 };
            let steps = vec![Step::Down { input: 0x57 }, Step::Press { input: 256, hold_ms: 10_000.0 }];
            run_macro(&steps, Loop::Forever, &*r2, &mut Ctx { waiter: &mut w, cancel: &c2, rng: Rng::new(1), t: now_ms() }, &|| true);
        });
        std::thread::sleep(std::time::Duration::from_millis(30));
        c.stop();
        h.join().unwrap();
        let evs = rec.events();
        assert_eq!(evs, vec![Ev::In(0x57, true), Ev::In(256, true), Ev::In(256, false), Ev::In(0x57, false)]);
    }

    #[test]
    fn rapid_fire_rate_is_accurate() {
        let rec = std::sync::Arc::new(Rec::default());
        let c = std::sync::Arc::new(Cancel::new());
        let (r2, c2) = (rec.clone(), c.clone());
        let h = std::thread::spawn(move || {
            let mut w = SpinWaiter { spin_ms: 2.0 };
            run_rapid(256, 100.0, 3.0, 0.0, &*r2, &mut Ctx { waiter: &mut w, cancel: &c2, rng: Rng::new(1), t: now_ms() }, &mut |_| {}, &|| true);
        });
        std::thread::sleep(std::time::Duration::from_millis(205));
        c.stop();
        h.join().unwrap();
        let downs: Vec<f64> =
            rec.evs.lock().iter().filter(|(_, e)| *e == Ev::In(256, true)).map(|(t, _)| *t).collect();
        assert!((19..=22).contains(&downs.len()), "{} taps in 205 ms at 100/s", downs.len());
        let gaps: Vec<f64> = downs.windows(2).map(|w| w[1] - w[0]).collect();
        let mean = gaps.iter().sum::<f64>() / gaps.len() as f64;
        assert!((mean - 10.0).abs() < 0.5, "mean gap {mean}");
        // Ended released.
        assert_eq!(rec.events().last(), Some(&Ev::In(256, false)));
    }

    #[test]
    fn auto_hold_is_a_square_wave() {
        assert_eq!(rapid_hold(0.0, 66.0), 33.0);
        assert_eq!(rapid_hold(15.0, 66.0), 15.0);
        assert_eq!(rapid_hold(500.0, 100.0), 75.0);
    }

    #[test]
    fn rapid_reports_its_timing() {
        let rec = std::sync::Arc::new(Rec::default());
        let c = std::sync::Arc::new(Cancel::new());
        let (r2, c2) = (rec.clone(), c.clone());
        let h = std::thread::spawn(move || {
            let mut w = SpinWaiter { spin_ms: 2.0 };
            let mut late = Vec::new();
            run_rapid(256, 50.0, 0.0, 0.0, &*r2, &mut Ctx { waiter: &mut w, cancel: &c2, rng: Rng::new(1), t: now_ms() }, &mut |l| late.push(l), &|| true);
            late
        });
        std::thread::sleep(std::time::Duration::from_millis(110));
        c.stop();
        let late = h.join().unwrap();
        assert!(late.len() >= 4, "{} presses", late.len());
        assert!(late.iter().all(|l| *l < 3.0), "{late:?}");
        // Auto hold: down for half of each 20 ms period.
        let evs = rec.evs.lock().clone();
        let downs: Vec<f64> = evs.iter().filter(|(_, e)| *e == Ev::In(256, true)).map(|(t, _)| *t).collect();
        let ups: Vec<f64> = evs.iter().filter(|(_, e)| *e == Ev::In(256, false)).map(|(t, _)| *t).collect();
        let held = ups[0] - downs[0];
        assert!((9.0..12.0).contains(&held), "held {held} ms");
    }

    #[test]
    fn rapid_skips_presses_while_conditions_fail_and_keeps_the_beat() {
        use std::sync::atomic::{AtomicBool, Ordering};
        let rec = std::sync::Arc::new(Rec::default());
        let c = std::sync::Arc::new(Cancel::new());
        let gate = std::sync::Arc::new(AtomicBool::new(true));
        let (r2, c2, g2) = (rec.clone(), c.clone(), gate.clone());
        let h = std::thread::spawn(move || {
            let mut w = SpinWaiter { spin_ms: 2.0 };
            let ok = || g2.load(Ordering::Relaxed);
            run_rapid(256, 100.0, 0.0, 0.0, &*r2, &mut Ctx { waiter: &mut w, cancel: &c2, rng: Rng::new(1), t: now_ms() }, &mut |_| {}, &ok);
        });
        std::thread::sleep(std::time::Duration::from_millis(55));
        gate.store(false, Ordering::Relaxed); // e.g. aim released / menu opened
        let paused_at = rec.events().len();
        std::thread::sleep(std::time::Duration::from_millis(60));
        let during = rec.events().len() - paused_at;
        gate.store(true, Ordering::Relaxed);
        std::thread::sleep(std::time::Duration::from_millis(55));
        c.stop();
        h.join().unwrap();
        assert!(during <= 2, "{during} events while paused (at most the press in flight)");
        let downs: Vec<f64> =
            rec.evs.lock().iter().filter(|(_, e)| *e == Ev::In(256, true)).map(|(t, _)| *t).collect();
        assert!(downs.len() >= 8, "{} presses", downs.len());
        // Resumed on the 10 ms grid, not at a random moment.
        let first = downs[0];
        for d in &downs {
            let off = (d - first) % 10.0;
            assert!(off < 2.0 || off > 8.0, "press {d} is {off} ms off the beat");
        }
        assert_eq!(rec.events().last(), Some(&Ev::In(256, false)));
    }

    #[test]
    fn macro_waits_while_conditions_fail() {
        let rec = Rec::default();
        let mut w = SpinWaiter { spin_ms: 1.0 };
        let c = Cancel::new();
        run_macro(&[Step::Press { input: 0x41, hold_ms: 0.0 }], Loop::Times(3), &rec, &mut ctx(&mut w, &c), &|| false);
        assert!(rec.events().is_empty(), "a counted run ends when its conditions fail");
    }

    #[test]
    fn variation_never_shortens_a_gap() {
        let rec = std::sync::Arc::new(Rec::default());
        let c = std::sync::Arc::new(Cancel::new());
        let (r2, c2) = (rec.clone(), c.clone());
        let h = std::thread::spawn(move || {
            let mut w = SpinWaiter { spin_ms: 2.0 };
            run_rapid(256, 100.0, 0.0, 40.0, &*r2, &mut Ctx { waiter: &mut w, cancel: &c2, rng: Rng::new(9), t: now_ms() }, &mut |_| {}, &|| true);
        });
        std::thread::sleep(std::time::Duration::from_millis(300));
        c.stop();
        h.join().unwrap();
        let downs: Vec<f64> = rec.evs.lock().iter().filter(|(_, e)| *e == Ev::In(256, true)).map(|(t, _)| *t).collect();
        let gaps: Vec<f64> = downs.windows(2).map(|w| w[1] - w[0]).collect();
        assert!(gaps.len() >= 10);
        // Variation only adds: the average gap is longer than the set 10 ms
        // (by ~2 ms at 40 %), and gaps under 10 ms only happen when a late
        // press is followed by the schedule catching up (rare, timing only).
        let mean = gaps.iter().sum::<f64>() / gaps.len() as f64;
        let short = gaps.iter().filter(|g| **g < 9.8).count();
        assert!(mean > 10.8, "mean gap {mean}");
        assert!(short * 10 <= gaps.len(), "{short} of {} gaps under 10 ms: {gaps:?}", gaps.len());
    }

    #[test]
    fn finish_ends_after_the_pass() {
        let rec = Rec::default();
        let mut w = SpinWaiter { spin_ms: 1.0 };
        let c = Cancel::new();
        c.finish();
        let steps = vec![Step::Press { input: 0x41, hold_ms: 0.0 }];
        run_macro(&steps, Loop::Forever, &rec, &mut ctx(&mut w, &c), &|| true);
        assert_eq!(rec.events(), vec![Ev::In(0x41, true), Ev::In(0x41, false)]);
    }
}
