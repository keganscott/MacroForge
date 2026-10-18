//! The engine thread: owns the user's data and every running action, reacts
//! to triggers from the hook, and keeps the hook's table current.
//!
//! Threads:
//! - hook thread (platform): Windows' low-level hooks, time-critical priority.
//!   Decides pass / swallow (gate.rs) and sends `HookMsg`s here.
//! - engine thread (this file): starts / stops runs, remaps, hold-locks.
//! - one worker per running macro or rapid fire, high priority, precise timer.

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use crossbeam_channel::{select, unbounded, Receiver, Sender};
use parking_lot::Mutex;
use serde::Serialize;

use crate::gate::{HookMsg, Shared};
use crate::input::{self, Input};
use crate::model::{Conditions, Data, Step, TimingMode, TriggerMode};
use crate::recorder::{self, RecEv};
use crate::runner::{self, Ctx, Loop, Output};
use crate::table::{compile, Bound, Compiled, Table};
use crate::timing::{now_ms, Cancel, Rng, Waiter};

/// What the platform layer provides.
pub trait Platform: Send + Sync + 'static {
    fn output(&self) -> Arc<dyn Output>;
    fn waiter(&self, timing: TimingMode) -> Box<dyn Waiter>;
    /// Called first thing on every worker thread (priority, MMCSS).
    fn worker_setup(&self) {}
    fn foreground(&self, hwnd: isize) -> Foreground;
    /// Install the input hooks on their own thread.
    fn start_hook(&self, shared: Arc<Shared>) -> Box<dyn HookHandle>;
    fn self_elevated(&self) -> bool {
        false
    }
    /// Sends that Windows refused (e.g. into an elevated window).
    fn send_failures(&self) -> u64 {
        0
    }
}

pub trait HookHandle: Send {
    /// Re-check which hooks are needed (mouse hook on/off).
    fn refresh(&self);
    fn info(&self) -> HookInfo;
    fn stop(self: Box<Self>);
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Foreground {
    /// Lower-case file name, e.g. `cs2.exe`.
    pub exe: Option<String>,
    /// MacroForge's own window.
    pub own: bool,
    /// Runs as administrator (None: could not tell).
    pub elevated: Option<bool>,
}

/// Gets status, HUD and live events to the UI.
pub trait Notifier: Send + Sync + 'static {
    fn status(&self, status: &Status);
    fn hud(&self, hud: &Hud);
    fn monitor(&self, events: &[MonitorEvent]);
    fn recorded(&self, count: usize);
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HookInfo {
    pub keyboard: bool,
    pub mouse: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunInfo {
    pub id: String,
    pub label: String,
    pub mode: TriggerMode,
    pub started_ms: f64,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub armed: bool,
    pub foreground: Option<String>,
    pub foreground_elevated: Option<bool>,
    pub self_elevated: bool,
    /// Bindings are paused while MacroForge's own window is in front.
    pub paused_own_window: bool,
    pub active_profiles: Vec<String>,
    pub live_bindings: usize,
    pub running: Vec<RunInfo>,
    /// Binding ids whose hold-lock is currently holding its key.
    pub locks: Vec<String>,
    pub hook: HookInfo,
    pub recording: bool,
    pub monitoring: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hud {
    pub text: String,
    /// true: something turned on; false: turned off.
    pub on: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorEvent {
    pub input: Input,
    pub down: bool,
    pub injected: bool,
    pub t: f64,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub hook_events: u64,
    pub hook_avg_us: f64,
    pub hook_max_us: f64,
    /// Physical trigger to MacroForge's first output, in microseconds.
    pub latency_samples: usize,
    pub latency_p50_us: f64,
    pub latency_p99_us: f64,
    pub latency_max_us: f64,
    pub send_failures: u64,
    /// The latest rapid fire run: what it was asked for and how late each
    /// press actually went out against its schedule.
    pub rapid_label: String,
    pub rapid_target_ms: f64,
    pub rapid_hold_ms: f64,
    pub rapid_presses: usize,
    pub rapid_late_p50_us: f64,
    pub rapid_late_p99_us: f64,
    pub rapid_late_max_us: f64,
}

/// Timing of the latest rapid fire run.
#[derive(Default)]
struct Rhythm {
    label: String,
    target_ms: f64,
    hold_ms: f64,
    presses: usize,
    late_us: Vec<f64>,
}

// ------------------------------------------------------------------ pool --

type Task = Box<dyn FnOnce() + Send>;

/// Threads that run macros and rapid fire, started up front and parked at
/// time-critical priority. A fresh thread per press starts at normal
/// priority, and while a game keeps the CPU busy it can wait a long time for
/// its first slice: measured at a median of 0.7 s with every core loaded
/// (examples/start_check.rs), against about 8 µs for a parked thread.
struct Pool {
    tx: Sender<Task>,
    rx: Receiver<Task>,
    idle: Arc<std::sync::atomic::AtomicUsize>,
    platform: Arc<dyn Platform>,
    spawned: usize,
}

const POOL_START: usize = 4;
const POOL_MAX: usize = 64;

impl Pool {
    fn new(platform: Arc<dyn Platform>) -> Pool {
        let (tx, rx) = unbounded();
        let mut pool = Pool { tx, rx, idle: Arc::new(std::sync::atomic::AtomicUsize::new(0)), platform, spawned: 0 };
        for _ in 0..POOL_START {
            pool.grow();
        }
        // Wait (briefly) until they are parked, so the first press is instant.
        let deadline = std::time::Instant::now() + Duration::from_millis(500);
        while pool.idle.load(Ordering::Acquire) < POOL_START && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(1));
        }
        pool
    }

    fn grow(&mut self) {
        let (rx, idle, platform) = (self.rx.clone(), self.idle.clone(), self.platform.clone());
        let n = self.spawned;
        let ok = std::thread::Builder::new().name(format!("macroforge-worker-{n}")).spawn(move || {
            platform.worker_setup();
            loop {
                idle.fetch_add(1, Ordering::AcqRel);
                let task = rx.recv();
                idle.fetch_sub(1, Ordering::AcqRel);
                match task {
                    Ok(task) => task(),
                    Err(_) => break,
                }
            }
        });
        if ok.is_ok() {
            self.spawned += 1;
        }
    }

    fn submit(&mut self, task: Task) {
        // Everyone busy: add a thread (it parks for next time too).
        if self.idle.load(Ordering::Acquire) == 0 && self.spawned < POOL_MAX {
            self.grow();
        }
        let _ = self.tx.send(task);
    }
}

enum Cmd {
    SetData(Box<Data>),
    SetArmed(Option<bool>),
    Panic,
    Capture(Sender<(Input, u8)>),
    CancelCapture,
    RecordStart,
    RecordStop(Sender<Vec<Step>>),
    Play { id: String, label: String, steps: Arc<Vec<Step>> },
    StopRun(String),
    Monitor(bool),
    WorkerDone { id: Arc<str>, run: u64 },
    Status(Sender<Status>),
    Shutdown,
}

struct Run {
    cancel: Arc<Cancel>,
    run: u64,
    info: RunInfo,
}

/// Latency samples, newest last, capped.
#[derive(Default)]
struct Latency(Vec<f64>);

impl Latency {
    fn push(&mut self, us: f64) {
        if self.0.len() >= 512 {
            self.0.remove(0);
        }
        self.0.push(us);
    }
}

pub struct Engine {
    tx: Sender<Cmd>,
    shared: Arc<Shared>,
    latency: Arc<Mutex<Latency>>,
    rhythm: Arc<Mutex<Rhythm>>,
    platform: Arc<dyn Platform>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl Engine {
    pub fn start(data: Data, platform: Arc<dyn Platform>, notifier: Arc<dyn Notifier>) -> Engine {
        let (hook_tx, hook_rx) = unbounded();
        let (tx, rx) = unbounded();
        let shared = Arc::new(Shared::new(hook_tx));
        let latency = Arc::new(Mutex::new(Latency::default()));
        let rhythm = Arc::new(Mutex::new(Rhythm::default()));
        let hook = platform.start_hook(shared.clone());
        let mut core = Core {
            armed: data.settings.armed_on_launch,
            data,
            platform: platform.clone(),
            notifier,
            shared: shared.clone(),
            hook,
            tx: tx.clone(),
            fg: Foreground::default(),
            table: Arc::new(Table::empty()),
            runs: HashMap::new(),
            locks: HashMap::new(),
            remaps: HashMap::new(),
            next_run: 1,
            capture: None,
            recording: None,
            monitor: false,
            monitor_buf: Vec::new(),
            latency: latency.clone(),
            rhythm: rhythm.clone(),
            pool: Pool::new(platform.clone()),
        };
        let thread = std::thread::Builder::new()
            .name("macroforge-engine".into())
            .spawn(move || {
                core.platform.worker_setup();
                core.apply_settings();
                core.rebuild();
                core.run(rx, hook_rx);
            })
            .expect("spawn engine thread");
        Engine { tx, shared, latency, rhythm, platform, thread: Mutex::new(Some(thread)) }
    }

    pub fn set_data(&self, data: Data) {
        let _ = self.tx.send(Cmd::SetData(Box::new(data)));
    }

    pub fn set_armed(&self, armed: Option<bool>) {
        let _ = self.tx.send(Cmd::SetArmed(armed));
    }

    /// Stop everything and let go of every key MacroForge holds.
    pub fn panic(&self) {
        let _ = self.tx.send(Cmd::Panic);
    }

    /// Wait for the next key or button the user presses (swallowed).
    pub fn capture(&self, timeout: Duration) -> Option<(Input, u8)> {
        let (tx, rx) = crossbeam_channel::bounded(1);
        let _ = self.tx.send(Cmd::Capture(tx));
        let got = rx.recv_timeout(timeout).ok();
        if got.is_none() {
            let _ = self.tx.send(Cmd::CancelCapture);
        }
        got
    }

    pub fn cancel_capture(&self) {
        let _ = self.tx.send(Cmd::CancelCapture);
    }

    pub fn record_start(&self) {
        let _ = self.tx.send(Cmd::RecordStart);
    }

    pub fn record_stop(&self) -> Vec<Step> {
        let (tx, rx) = crossbeam_channel::bounded(1);
        let _ = self.tx.send(Cmd::RecordStop(tx));
        rx.recv_timeout(Duration::from_secs(5)).unwrap_or_default()
    }

    /// Play steps now (the editor's Play button). `id` lets it be stopped.
    pub fn play(&self, id: String, label: String, steps: Vec<Step>) {
        let _ = self.tx.send(Cmd::Play { id, label, steps: Arc::new(steps) });
    }

    pub fn stop_run(&self, id: String) {
        let _ = self.tx.send(Cmd::StopRun(id));
    }

    pub fn set_monitor(&self, on: bool) {
        let _ = self.tx.send(Cmd::Monitor(on));
    }

    pub fn status(&self) -> Status {
        let (tx, rx) = crossbeam_channel::bounded(1);
        let _ = self.tx.send(Cmd::Status(tx));
        rx.recv_timeout(Duration::from_secs(2)).unwrap_or_default()
    }

    pub fn stats(&self) -> Stats {
        let sh = &self.shared;
        let events = sh.events.load(Ordering::Relaxed);
        let busy = sh.busy_ns.load(Ordering::Relaxed);
        let mut s = Stats {
            hook_events: events,
            hook_avg_us: if events > 0 { busy as f64 / events as f64 / 1000.0 } else { 0.0 },
            hook_max_us: sh.max_ns.load(Ordering::Relaxed) as f64 / 1000.0,
            send_failures: self.platform.send_failures(),
            ..Default::default()
        };
        let mut v = self.latency.lock().0.clone();
        if !v.is_empty() {
            v.sort_by(|a, b| a.total_cmp(b));
            let pct = |p: f64| v[((v.len() - 1) as f64 * p).round() as usize];
            s.latency_samples = v.len();
            s.latency_p50_us = pct(0.5);
            s.latency_p99_us = pct(0.99);
            s.latency_max_us = *v.last().unwrap();
        }
        let r = self.rhythm.lock();
        if r.presses > 0 {
            let mut late = r.late_us.clone();
            late.sort_by(|a, b| a.total_cmp(b));
            let pct = |p: f64| late[((late.len() - 1) as f64 * p).round() as usize];
            s.rapid_label = r.label.clone();
            s.rapid_target_ms = r.target_ms;
            s.rapid_hold_ms = r.hold_ms;
            s.rapid_presses = r.presses;
            s.rapid_late_p50_us = pct(0.5);
            s.rapid_late_p99_us = pct(0.99);
            s.rapid_late_max_us = *late.last().unwrap();
        }
        s
    }

    pub fn reset_stats(&self) {
        self.shared.events.store(0, Ordering::Relaxed);
        self.shared.busy_ns.store(0, Ordering::Relaxed);
        self.shared.max_ns.store(0, Ordering::Relaxed);
        self.latency.lock().0.clear();
        *self.rhythm.lock() = Rhythm::default();
    }

    /// Stop every run, release every key, remove the hooks. Idempotent.
    pub fn shutdown(&self) {
        let _ = self.tx.send(Cmd::Shutdown);
        if let Some(t) = self.thread.lock().take() {
            let _ = t.join();
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct Core {
    data: Data,
    platform: Arc<dyn Platform>,
    notifier: Arc<dyn Notifier>,
    shared: Arc<Shared>,
    hook: Box<dyn HookHandle>,
    tx: Sender<Cmd>,
    armed: bool,
    fg: Foreground,
    table: Arc<Table>,
    runs: HashMap<Arc<str>, Run>,
    /// Hold-locks currently holding their key: binding id -> key.
    locks: HashMap<Arc<str>, Input>,
    /// Remaps whose output is down: binding id -> (key, modifiers pressed).
    remaps: HashMap<Arc<str>, (Input, u8)>,
    next_run: u64,
    capture: Option<Sender<(Input, u8)>>,
    recording: Option<Vec<(f64, RecEv)>>,
    monitor: bool,
    monitor_buf: Vec<MonitorEvent>,
    latency: Arc<Mutex<Latency>>,
    rhythm: Arc<Mutex<Rhythm>>,
    pool: Pool,
}

impl Core {
    fn run(mut self, rx: Receiver<Cmd>, hook_rx: Receiver<HookMsg>) {
        // The engine sleeps until there is input or a command. The 50 ms
        // tick that batches input-monitor events only exists while the
        // monitor is on; otherwise an idle engine never wakes.
        let tick = crossbeam_channel::tick(Duration::from_millis(50));
        let never = crossbeam_channel::never();
        loop {
            let ticker = if self.monitor { &tick } else { &never };
            select! {
                recv(hook_rx) -> m => if let Ok(m) = m { self.on_hook(m) },
                recv(rx) -> c => match c {
                    Ok(Cmd::Shutdown) | Err(_) => break,
                    Ok(c) => self.on_cmd(c),
                },
                recv(ticker) -> _ => self.flush_monitor(),
            }
        }
        self.stop_everything();
        self.hook.stop();
    }

    fn apply_settings(&mut self) {
        let s = &self.data.settings;
        self.shared.set_hotkeys(s.master_hotkey, s.panic_hotkey);
        self.shared.ignore_foreign.store(s.ignore_foreign_injected, Ordering::Relaxed);
        self.shared.record_moves.store(s.record_mouse_moves, Ordering::Relaxed);
        self.shared.armed.store(self.armed, Ordering::Relaxed);
    }

    /// Rebuild the trigger table for the current data and app in front, and
    /// stop anything that no longer applies (e.g. a toggle when you alt-tab
    /// out of its game).
    fn rebuild(&mut self) {
        let table = if self.fg.own { Table::empty() } else { compile(&self.data, self.fg.exe.as_deref()) };
        let table = Arc::new(table);
        *self.shared.table.write() = table.clone();
        self.table = table;
        let gone: Vec<Arc<str>> = self
            .runs
            .keys()
            .filter(|id| !id.starts_with("play:") && !self.table.contains(id))
            .cloned()
            .collect();
        for id in gone {
            self.stop_run(&id, true);
        }
        let out = self.platform.output();
        self.locks.retain(|id, key| {
            let keep = self.table.contains(id);
            if !keep {
                out.input(*key, false);
            }
            keep
        });
        self.remaps.retain(|id, (key, mods)| {
            let keep = self.table.contains(id);
            if !keep {
                release_remap(&*out, *key, *mods);
            }
            keep
        });
        self.hook.refresh();
        self.publish();
    }

    fn status(&self) -> Status {
        let mut running: Vec<RunInfo> = self.runs.values().map(|r| r.info.clone()).collect();
        running.sort_by(|a, b| a.started_ms.total_cmp(&b.started_ms));
        Status {
            armed: self.armed,
            foreground: self.fg.exe.clone(),
            foreground_elevated: self.fg.elevated,
            self_elevated: self.platform.self_elevated(),
            paused_own_window: self.fg.own,
            active_profiles: self.table.active_profiles.clone(),
            live_bindings: self.table.bindings.len(),
            running,
            locks: self.locks.keys().map(|k| k.to_string()).collect(),
            hook: self.hook.info(),
            recording: self.recording.is_some(),
            monitoring: self.monitor,
        }
    }

    fn publish(&self) {
        self.notifier.status(&self.status());
    }

    /// Something switched on or off: the notifier decides on notice, sound
    /// and the activity list from the user's settings.
    fn hud(&self, text: impl Into<String>, on: bool) {
        self.notifier.hud(&Hud { text: text.into(), on });
    }

    fn on_cmd(&mut self, c: Cmd) {
        match c {
            Cmd::SetData(d) => {
                self.data = *d;
                self.apply_settings();
                self.rebuild();
            }
            Cmd::SetArmed(a) => self.set_armed(a.unwrap_or(!self.armed), false),
            Cmd::Panic => {
                self.stop_everything();
                self.hud("Stopped everything", false);
                self.publish();
            }
            Cmd::Capture(reply) => {
                self.capture = Some(reply);
                self.shared.capture.store(true, Ordering::SeqCst);
                self.hook.refresh();
            }
            Cmd::CancelCapture => {
                self.capture = None;
                self.shared.capture.store(false, Ordering::SeqCst);
                self.hook.refresh();
            }
            Cmd::RecordStart => {
                self.recording = Some(Vec::new());
                self.shared.recording.store(true, Ordering::SeqCst);
                self.hook.refresh();
                self.publish();
            }
            Cmd::RecordStop(reply) => {
                self.shared.recording.store(false, Ordering::SeqCst);
                let evs = self.recording.take().unwrap_or_default();
                let s = &self.data.settings;
                let _ = reply.send(recorder::to_steps(&evs, s.record_timing, s.record_fixed_delay_ms));
                self.hook.refresh();
                self.publish();
            }
            Cmd::Play { id, label, steps } => {
                let id: Arc<str> = Arc::from(format!("play:{id}"));
                self.stop_run(&id, true);
                let job = Job::Macro { steps, lp: Loop::Times(1), conditions: Conditions::default() };
                self.start(id, label, TriggerMode::Press, job, now_ms());
            }
            Cmd::StopRun(id) => {
                let key: Option<Arc<str>> = self.runs.keys().find(|k| ***k == *id || k.strip_prefix("play:") == Some(&id)).cloned();
                if let Some(k) = key {
                    self.stop_run(&k, true);
                }
            }
            Cmd::Monitor(on) => {
                self.monitor = on;
                self.shared.monitor.store(on, Ordering::SeqCst);
                self.hook.refresh();
                self.publish();
            }
            Cmd::WorkerDone { id, run } => {
                if self.runs.get(&id).is_some_and(|r| r.run == run) {
                    self.runs.remove(&id);
                    self.publish();
                }
            }
            Cmd::Status(reply) => {
                let _ = reply.send(self.status());
            }
            Cmd::Shutdown => {}
        }
    }

    fn set_armed(&mut self, armed: bool, from_hotkey: bool) {
        self.armed = armed;
        self.shared.armed.store(armed, Ordering::SeqCst);
        // Off: no mouse binding can fire, so the mouse hook comes out.
        self.hook.refresh();
        if !armed {
            self.stop_everything();
        }
        let _ = from_hotkey;
        self.hud(if armed { "Bindings on" } else { "Bindings off" }, armed);
        self.publish();
    }

    fn on_hook(&mut self, m: HookMsg) {
        match m {
            HookMsg::Trigger { bound, down, repeat, t } => self.on_trigger(bound, down, repeat, t),
            HookMsg::MasterHotkey => self.set_armed(!self.armed, true),
            HookMsg::PanicHotkey => {
                self.stop_everything();
                self.hud("Stopped everything", false);
                self.publish();
            }
            HookMsg::Captured { input, mods } => {
                if let Some(reply) = self.capture.take() {
                    let _ = reply.send((input, mods));
                }
                self.hook.refresh();
            }
            HookMsg::Record { input, down, t } => {
                if let Some(rec) = &mut self.recording {
                    if rec.len() < 50_000 {
                        rec.push((t, RecEv::Input { input, down }));
                        self.notifier.recorded(rec.len());
                    }
                }
            }
            HookMsg::RecordMove { dx, dy, t } => {
                if let Some(rec) = &mut self.recording {
                    if rec.len() < 50_000 {
                        rec.push((t, RecEv::Move { dx, dy }));
                    }
                }
            }
            HookMsg::Monitor { input, down, injected, t } => {
                if self.monitor_buf.len() < 500 {
                    self.monitor_buf.push(MonitorEvent { input, down, injected, t });
                }
            }
            HookMsg::Foreground(hwnd) => {
                let fg = self.platform.foreground(hwnd);
                if fg != self.fg {
                    let changed_app = fg.exe != self.fg.exe || fg.own != self.fg.own;
                    self.shared.own_foreground.store(fg.own, Ordering::SeqCst);
                    self.fg = fg;
                    if changed_app {
                        self.rebuild();
                    } else {
                        self.publish();
                    }
                }
            }
        }
    }

    fn flush_monitor(&mut self) {
        if !self.monitor_buf.is_empty() {
            self.notifier.monitor(&self.monitor_buf);
            self.monitor_buf.clear();
        }
    }

    fn note_latency(&self, t: f64) {
        self.latency.lock().push((now_ms() - t) * 1000.0);
    }

    fn on_trigger(&mut self, b: Arc<Bound>, down: bool, repeat: bool, t: f64) {
        let id = b.id.clone();
        match &b.action {
            Compiled::Block => {}
            Compiled::Remap { output, mods } => {
                let out = self.platform.output();
                if down {
                    if !repeat {
                        for m in input::modifier_keys(*mods) {
                            out.input(m, true);
                        }
                        self.remaps.insert(id, (*output, *mods));
                    }
                    out.input(*output, true);
                    if !repeat {
                        self.note_latency(t);
                    }
                } else if let Some((key, mods)) = self.remaps.remove(&id) {
                    release_remap(&*out, key, mods);
                }
            }
            Compiled::HoldLock { output } => {
                if !down || repeat {
                    return;
                }
                let out = self.platform.output();
                if let Some(key) = self.locks.remove(&id) {
                    out.input(key, false);
                    self.hud(format!("{} released", b.label), false);
                } else {
                    out.input(*output, true);
                    self.note_latency(t);
                    self.locks.insert(id, *output);
                    self.hud(format!("{} held", b.label), true);
                }
                self.publish();
            }
            Compiled::Macro { steps, repeat: times, on_repress, stop_immediately } => {
                let job = || Job::Macro {
                    steps: steps.clone(),
                    lp: Loop::for_mode(b.trigger.mode, *times),
                    conditions: b.conditions,
                };
                self.mode_logic(&b, down, repeat, t, *on_repress, *stop_immediately, job);
            }
            Compiled::Rapid { output, rate, hold_ms, jitter_pct } => {
                let job = || Job::Rapid {
                    output: *output,
                    rate: *rate,
                    hold_ms: *hold_ms,
                    jitter_pct: *jitter_pct,
                    conditions: b.conditions,
                };
                self.mode_logic(&b, down, repeat, t, crate::model::Repress::Ignore, true, job);
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn mode_logic(
        &mut self,
        b: &Arc<Bound>,
        down: bool,
        repeat: bool,
        t: f64,
        on_repress: crate::model::Repress,
        stop_immediately: bool,
        job: impl Fn() -> Job,
    ) {
        if repeat {
            return;
        }
        let running = self.runs.contains_key(&b.id);
        match (b.trigger.mode, down) {
            (TriggerMode::Press, true) => {
                let (stop, start) = if running { runner::on_repress(on_repress) } else { (false, true) };
                if stop {
                    self.stop_run(&b.id, true);
                }
                if start {
                    self.start(b.id.clone(), b.label.clone(), TriggerMode::Press, job(), t);
                }
            }
            (TriggerMode::Hold, true) => {
                if !running {
                    self.start(b.id.clone(), b.label.clone(), TriggerMode::Hold, job(), t);
                }
            }
            (TriggerMode::Hold, false) => self.stop_run(&b.id, stop_immediately),
            (TriggerMode::Toggle, true) => {
                if running {
                    self.stop_run(&b.id, stop_immediately);
                    self.hud(format!("{} off", b.label), false);
                } else {
                    self.start(b.id.clone(), b.label.clone(), TriggerMode::Toggle, job(), t);
                    self.hud(format!("{} on", b.label), true);
                }
            }
            _ => {}
        }
    }

    fn start(&mut self, id: Arc<str>, label: String, mode: TriggerMode, job: Job, t: f64) {
        let run = self.next_run;
        self.next_run += 1;
        let cancel = Arc::new(Cancel::new());
        let platform = self.platform.clone();
        let timing = self.data.settings.timing;
        let tx = self.tx.clone();
        let latency = self.latency.clone();
        let rhythm = self.rhythm.clone();
        if let Job::Rapid { rate, hold_ms, .. } = &job {
            let period = 1000.0 / rate.max(0.01);
            *rhythm.lock() = Rhythm {
                label: label.clone(),
                target_ms: period,
                hold_ms: runner::rapid_hold(*hold_ms, period),
                ..Default::default()
            };
        }
        let (c2, id2) = (cancel.clone(), id.clone());
        // The binding's conditions, re-checked before every press / pass.
        let (shared, conditions) = (self.shared.clone(), job.conditions());
        self.pool.submit(Box::new(move || {
            let out = platform.output();
            let mut waiter = platform.waiter(timing);
            latency.lock().push((now_ms() - t) * 1000.0);
            // A panic inside a run must still release keys (Held's Drop runs
            // during unwinding) and tell the engine the run is over.
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut cx = Ctx { waiter: &mut *waiter, cancel: &c2, rng: Rng::from_time(), t: now_ms() };
                let ok = || !conditions.any() || shared.conditions_ok(&conditions);
                match job {
                    Job::Macro { steps, lp, .. } => runner::run_macro(&steps, lp, &*out, &mut cx, &ok),
                    Job::Rapid { output, rate, hold_ms, jitter_pct, .. } => {
                        runner::run_rapid(output, rate, hold_ms, jitter_pct, &*out, &mut cx, &mut |late| {
                            let mut r = rhythm.lock();
                            r.presses += 1;
                            if r.late_us.len() < 4096 {
                                r.late_us.push(late * 1000.0);
                            }
                        }, &ok)
                    }
                }
            }));
            let _ = tx.send(Cmd::WorkerDone { id: id2, run });
        }));
        self.runs.insert(id.clone(), Run { cancel, run, info: RunInfo { id: id.to_string(), label, mode, started_ms: now_ms() } });
        self.publish();
    }

    fn stop_run(&mut self, id: &Arc<str>, immediately: bool) {
        let Some(r) = self.runs.get(id) else { return };
        if immediately {
            r.cancel.stop();
            // Its worker reports WorkerDone; drop it from the list now so a
            // fast re-press starts a fresh run instead of seeing "running".
            self.runs.remove(id);
            self.publish();
        } else {
            r.cancel.finish();
        }
    }

    fn stop_everything(&mut self) {
        for (_, r) in self.runs.drain() {
            r.cancel.stop();
        }
        let out = self.platform.output();
        for (_, key) in self.locks.drain() {
            out.input(key, false);
        }
        for (_, (key, mods)) in self.remaps.drain() {
            release_remap(&*out, key, mods);
        }
    }
}

fn release_remap(out: &dyn Output, key: Input, mods: u8) {
    out.input(key, false);
    let keys: Vec<Input> = input::modifier_keys(mods).collect();
    for m in keys.into_iter().rev() {
        out.input(m, false);
    }
}

enum Job {
    Macro { steps: Arc<Vec<Step>>, lp: Loop, conditions: Conditions },
    Rapid { output: Input, rate: f64, hold_ms: f64, jitter_pct: f64, conditions: Conditions },
}

impl Job {
    fn conditions(&self) -> Conditions {
        match self {
            Job::Macro { conditions, .. } | Job::Rapid { conditions, .. } => *conditions,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gate::{Gate, Origin};
    use crate::model::{Action, Binding, Macro, Repress, Trigger};
    use crate::runner::tests::{Ev, Rec};
    use crate::timing::SpinWaiter;

    struct Fake {
        out: Arc<Rec>,
        shared: Mutex<Option<Arc<Shared>>>,
    }

    struct FakeHook;
    impl HookHandle for FakeHook {
        fn refresh(&self) {}
        fn info(&self) -> HookInfo {
            HookInfo { keyboard: true, mouse: false }
        }
        fn stop(self: Box<Self>) {}
    }

    impl Platform for Fake {
        fn output(&self) -> Arc<dyn Output> {
            self.out.clone()
        }
        fn waiter(&self, _: TimingMode) -> Box<dyn Waiter> {
            Box::new(SpinWaiter { spin_ms: 1.0 })
        }
        fn foreground(&self, hwnd: isize) -> Foreground {
            Foreground { exe: (hwnd == 1).then(|| "game.exe".to_string()), own: hwnd == 2, elevated: Some(false) }
        }
        fn start_hook(&self, shared: Arc<Shared>) -> Box<dyn HookHandle> {
            *self.shared.lock() = Some(shared);
            Box::new(FakeHook)
        }
    }

    #[derive(Default)]
    struct Sink(Mutex<Vec<Hud>>);
    impl Notifier for Sink {
        fn status(&self, _: &Status) {}
        fn hud(&self, h: &Hud) {
            self.0.lock().push(h.clone());
        }
        fn monitor(&self, _: &[MonitorEvent]) {}
        fn recorded(&self, _: usize) {}
    }

    fn bind(id: &str, input: Input, mode: TriggerMode, action: Action) -> Binding {
        Binding { id: id.into(), trigger: Trigger { input, mode, ..Default::default() }, action, ..Default::default() }
    }

    struct Rig {
        engine: Engine,
        fake: Arc<Fake>,
        gate: Gate,
    }

    impl Rig {
        fn new(data: Data) -> Rig {
            let fake = Arc::new(Fake { out: Arc::new(Rec::default()), shared: Mutex::new(None) });
            let engine = Engine::start(data, fake.clone(), Arc::new(Sink::default()));
            let _ = engine.status(); // wait for the first rebuild
            Rig { engine, fake, gate: Gate::default() }
        }
        fn key(&mut self, code: Input, down: bool) -> bool {
            let sh = self.fake.shared.lock().clone().unwrap();
            self.gate.on_input(&sh, code, down, Origin::Physical)
        }
        fn settle(&self) {
            std::thread::sleep(Duration::from_millis(40));
            let _ = self.engine.status();
        }
        fn events(&self) -> Vec<Ev> {
            self.fake.out.events()
        }
    }

    fn data(bindings: Vec<Binding>) -> Data {
        let mut d = Data::default();
        d.profiles[0].bindings = bindings;
        d.macros.push(Macro {
            id: "m".into(),
            name: "M".into(),
            steps: vec![Step::Press { input: 0x42, hold_ms: 1.0 }, Step::Delay { ms: 5.0, jitter_ms: 0.0 }],
        });
        d
    }

    #[test]
    fn remap_sends_chord_and_releases_in_reverse() {
        let mut r = Rig::new(data(vec![bind("r", 0x41, TriggerMode::Press, Action::Remap { output: 0x43, mods: input::MOD_CTRL })]));
        assert!(r.key(0x41, true));
        assert!(r.key(0x41, false));
        r.settle();
        assert_eq!(r.events(), vec![Ev::In(0xA2, true), Ev::In(0x43, true), Ev::In(0x43, false), Ev::In(0xA2, false)]);
        assert!(r.engine.stats().latency_samples >= 1);
    }

    #[test]
    fn hold_mode_runs_while_held_and_releases() {
        let mut r = Rig::new(data(vec![bind(
            "h",
            256,
            TriggerMode::Hold,
            Action::Rapid { output: 256, rate: 200.0, hold_ms: 1.0, jitter_pct: 0.0 },
        )]));
        r.key(256, true);
        std::thread::sleep(Duration::from_millis(60));
        assert_eq!(r.engine.status().running.len(), 1);
        r.key(256, false);
        r.settle();
        assert!(r.engine.status().running.is_empty());
        let ev = r.events();
        let downs = ev.iter().filter(|e| **e == Ev::In(256, true)).count();
        let ups = ev.iter().filter(|e| **e == Ev::In(256, false)).count();
        assert!(downs >= 5, "{downs} taps");
        assert_eq!(downs, ups, "every tap released");
    }

    #[test]
    fn toggle_starts_and_stops_with_hud() {
        let mut r = Rig::new(data(vec![bind(
            "t",
            0x70,
            TriggerMode::Toggle,
            Action::Macro { macro_id: "m".into(), repeat: 1, on_repress: Repress::Ignore, stop_immediately: true },
        )]));
        r.key(0x70, true);
        r.key(0x70, false);
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(r.engine.status().running.len(), 1);
        r.key(0x70, true);
        r.key(0x70, false);
        r.settle();
        assert!(r.engine.status().running.is_empty());
        assert!(r.events().iter().filter(|e| **e == Ev::In(0x42, true)).count() >= 2);
        assert_eq!(r.events().last(), Some(&Ev::In(0x42, false)));
    }

    #[test]
    fn hold_lock_and_panic() {
        let mut r = Rig::new(data(vec![bind("l", 0x57, TriggerMode::Press, Action::HoldLock { output: 0x57 })]));
        r.key(0x57, true);
        r.key(0x57, false);
        r.settle();
        assert_eq!(r.engine.status().locks, vec!["l".to_string()]);
        r.engine.panic();
        r.settle();
        assert!(r.engine.status().locks.is_empty());
        assert_eq!(r.events(), vec![Ev::In(0x57, true), Ev::In(0x57, false)]);
    }

    #[test]
    fn leaving_the_game_stops_its_runs() {
        let mut d = data(vec![]);
        d.profiles[0].apps = vec!["game.exe".into()];
        d.profiles[0].bindings =
            vec![bind("g", 0x71, TriggerMode::Toggle, Action::Rapid { output: 0x41, rate: 50.0, hold_ms: 1.0, jitter_pct: 0.0 })];
        let mut r = Rig::new(d);
        assert!(!r.key(0x71, true), "inactive outside the game");
        r.key(0x71, false);
        let sh = r.fake.shared.lock().clone().unwrap();
        sh.tx.send(HookMsg::Foreground(1)).unwrap();
        r.settle();
        assert!(r.key(0x71, true));
        r.key(0x71, false);
        r.settle();
        assert_eq!(r.engine.status().running.len(), 1);
        sh.tx.send(HookMsg::Foreground(3)).unwrap();
        r.settle();
        assert!(r.engine.status().running.is_empty());
        // Own window: paused.
        sh.tx.send(HookMsg::Foreground(2)).unwrap();
        r.settle();
        assert!(r.engine.status().paused_own_window);
    }

    #[test]
    fn master_hotkey_disarms() {
        let mut r = Rig::new(data(vec![bind("b", 0x41, TriggerMode::Press, Action::Block)]));
        assert!(r.key(0x41, true));
        r.key(0x41, false);
        r.key(0x91, true);
        r.key(0x91, false);
        r.settle();
        assert!(!r.engine.status().armed);
        assert!(!r.key(0x41, true));
    }

    #[test]
    fn play_and_capture() {
        let mut r = Rig::new(data(vec![]));
        r.engine.play("x".into(), "X".into(), vec![Step::Text { text: "ok".into(), char_delay_ms: 0.0 }]);
        r.settle();
        assert_eq!(r.events(), vec![Ev::Ch('o'), Ev::Ch('k')]);
        let fake = r.fake.clone();
        let h = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(30));
            let sh = fake.shared.lock().clone().unwrap();
            let mut g = Gate::default();
            g.on_input(&sh, 0xA2, true, Origin::Physical);
            g.on_input(&sh, 0x46, true, Origin::Physical)
        });
        let got = r.engine.capture(Duration::from_secs(2));
        assert!(h.join().unwrap());
        assert_eq!(got, Some((0x46, input::MOD_CTRL)));
        let _ = r.key(0, false);
    }
}
