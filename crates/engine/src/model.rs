//! What the user builds: profiles of bindings, a library of macros, settings.
//! Everything here is plain data (serde, camelCase for the UI). `sanitize`
//! clamps every number and drops anything that cannot run, so a hand-edited
//! or corrupt file can never hand the engine a 0 Hz rate or a 10-minute hold.

use serde::{Deserialize, Serialize};

use crate::input::{self, Input, MOD_ALL};

/// 2: MacroForge's own Signal accent became the default; sound style and volume.
/// 3: rapid fire's old 15 / 20 ms default hold became auto (half the period).
pub const DATA_VERSION: u32 = 3;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Data {
    pub version: u32,
    pub profiles: Vec<Profile>,
    pub macros: Vec<Macro>,
    pub settings: Settings,
}

impl Default for Data {
    fn default() -> Self {
        Data { version: DATA_VERSION, profiles: vec![Profile::global()], macros: Vec::new(), settings: Settings::default() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    /// Executable names (`cs2.exe`) this profile is limited to. Empty means
    /// everywhere. Matched case-insensitively against the app in front.
    pub apps: Vec<String>,
    pub bindings: Vec<Binding>,
}

impl Default for Profile {
    fn default() -> Self {
        Profile { id: String::new(), name: "Profile".into(), enabled: true, apps: Vec::new(), bindings: Vec::new() }
    }
}

impl Profile {
    pub fn global() -> Self {
        Profile { id: "global".into(), name: "Everywhere".into(), ..Default::default() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Binding {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger: Trigger,
    pub action: Action,
    /// When it is allowed to fire (rapid fire and macros only).
    pub conditions: Conditions,
}

/// Extra conditions on a rapid fire or macro binding. Both off by default;
/// when both are on, both must hold.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Conditions {
    /// Fire only while this key or mouse button is held, e.g. right click
    /// to aim (0 = no such condition). Without it, the trigger works as a
    /// normal key or click.
    pub while_held: Input,
    /// Pause while the mouse cursor is showing (inventory, map, menus).
    pub pause_in_menus: bool,
}

impl Conditions {
    pub fn any(&self) -> bool {
        self.while_held != 0 || self.pause_in_menus
    }
}

impl Default for Binding {
    fn default() -> Self {
        Binding {
            id: String::new(),
            name: String::new(),
            enabled: true,
            trigger: Trigger::default(),
            action: Action::Block,
            conditions: Conditions::default(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Trigger {
    pub input: Input,
    /// Modifiers that must be held (input::MOD_*). Others may be held too.
    pub mods: u8,
    pub mode: TriggerMode,
    /// Let the game see the trigger key as well. Off by default: the trigger
    /// is consumed so only the binding's output reaches the game.
    pub passthrough: bool,
}

impl Default for Trigger {
    fn default() -> Self {
        Trigger { input: 0, mods: 0, mode: TriggerMode::Press, passthrough: false }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum TriggerMode {
    /// Run once per press.
    Press,
    /// Run repeatedly while held; stop on release.
    Hold,
    /// First press starts, second press stops.
    Toggle,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Repress {
    /// A press while it is still running is ignored.
    Ignore,
    /// A press while running stops it and starts it again from the top.
    Restart,
    /// A press while running stops it.
    Stop,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Action {
    /// Play a macro from the library.
    Macro {
        macro_id: String,
        /// Times to play per press (Press mode).
        #[serde(default = "one")]
        repeat: u32,
        #[serde(default = "repress_ignore")]
        on_repress: Repress,
        /// Hold / Toggle: stop mid-macro (true) or finish the current pass.
        #[serde(default = "yes")]
        stop_immediately: bool,
    },
    /// Turbo key / auto-clicker: tap `output` at `rate` per second.
    Rapid {
        output: Input,
        rate: f64,
        /// How long each tap is held down, in ms.
        #[serde(default = "default_hold")]
        hold_ms: f64,
        /// Random variation of each interval, 0-50 % of the period.
        #[serde(default)]
        jitter_pct: f64,
    },
    /// Send a different key or button (optionally with modifiers) instead.
    Remap {
        output: Input,
        #[serde(default)]
        mods: u8,
    },
    /// Press once to hold `output` down, press again to let go (auto-run).
    HoldLock { output: Input },
    /// Swallow the trigger (e.g. the Windows key while gaming).
    Block,
}

fn one() -> u32 {
    1
}
fn yes() -> bool {
    true
}
fn repress_ignore() -> Repress {
    Repress::Ignore
}
/// 0 = auto: hold for half the period (runner::rapid_hold).
fn default_hold() -> f64 {
    0.0
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Macro {
    pub id: String,
    pub name: String,
    pub steps: Vec<Step>,
}

impl Default for Macro {
    fn default() -> Self {
        Macro { id: String::new(), name: "Macro".into(), steps: Vec::new() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Step {
    /// Press and release a key or button, holding it `hold_ms`.
    Press { input: Input, hold_ms: f64 },
    Down { input: Input },
    Up { input: Input },
    /// Wheel notches (positive = up / right).
    Wheel { delta: i32, horizontal: bool },
    /// Relative mouse movement, spread over `duration_ms` (0 = instant).
    Move { dx: i32, dy: i32, duration_ms: f64 },
    /// Put the cursor at a desktop pixel position.
    MoveTo { x: i32, y: i32 },
    /// Wait `ms`, plus or minus up to `jitter_ms`.
    Delay { ms: f64, jitter_ms: f64 },
    /// Type text as Unicode characters.
    Text { text: String, char_delay_ms: f64 },
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TimingMode {
    /// High-resolution timer only (~0.5 ms). Least CPU.
    Efficient,
    /// Timer, then a short spin to the exact microsecond. Default.
    Precise,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Hotkey {
    pub input: Input,
    pub mods: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Turns every binding on or off. Scroll Lock by default (its LED shows the state).
    pub master_hotkey: Hotkey,
    /// Stops everything that is running and lets go of every held key.
    pub panic_hotkey: Hotkey,
    pub timing: TimingMode,
    /// Bindings start armed when the app opens.
    pub armed_on_launch: bool,
    /// Ignore input other programs inject (on-screen keyboards, other macro tools).
    pub ignore_foreign_injected: bool,
    /// The small on-screen notice when a toggle or the master switch changes.
    pub hud: bool,
    pub hud_position: HudPosition,
    pub sounds: bool,
    pub sound_style: SoundStyle,
    /// 0-100. Cues are quiet by design; 30 is the default.
    pub sound_volume: u8,
    pub close_to_tray: bool,
    pub start_minimized: bool,
    pub start_with_windows: bool,
    pub accent: String,
    /// Animations in the app: always, follow Windows' Animation effects, or never.
    pub motion: Motion,
    /// Recorder: keep the real gaps between events, or use a fixed delay.
    pub record_timing: RecordTiming,
    pub record_fixed_delay_ms: f64,
    pub record_mouse_moves: bool,
    pub seen_welcome: bool,
    /// Perfect 180: degrees per mouse count you measured in a game (for
    /// games with no reliable published value), by game id.
    pub turn_calibrations: Vec<TurnCalibration>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TurnCalibration {
    pub game: String,
    /// Degrees of turn per count at sensitivity 1.
    pub yaw: f64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HudPosition {
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Motion {
    Full,
    System,
    Off,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum SoundStyle {
    /// A soft mechanical key click.
    Click,
    /// Two gentle glass notes.
    Chime,
    /// A small rounded pop.
    Pop,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RecordTiming {
    Real,
    Fixed,
    None,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            master_hotkey: Hotkey { input: 0x91, mods: 0 },
            panic_hotkey: Hotkey { input: 0x13, mods: 0 },
            timing: TimingMode::Precise,
            armed_on_launch: true,
            ignore_foreign_injected: true,
            hud: true,
            hud_position: HudPosition::TopCenter,
            sounds: true,
            sound_style: SoundStyle::Click,
            sound_volume: 30,
            close_to_tray: true,
            start_minimized: false,
            start_with_windows: false,
            accent: "signal".into(),
            motion: Motion::Full,
            record_timing: RecordTiming::Real,
            record_fixed_delay_ms: 30.0,
            record_mouse_moves: false,
            seen_welcome: false,
            turn_calibrations: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------- limits ----

pub const MAX_RATE: f64 = 1000.0;
pub const MIN_RATE: f64 = 0.1;
pub const MAX_HOLD_MS: f64 = 60_000.0;
pub const MAX_DELAY_MS: f64 = 3_600_000.0;
pub const MAX_STEPS: usize = 20_000;
pub const MAX_TEXT: usize = 4_000;
pub const MAX_REPEAT: u32 = 100_000;
/// Mouse movement per step, in counts. Large enough for a 180° turn at very
/// low sensitivities (Overwatch at 0.5 needs ~54,500).
pub const MAX_MOVE: i32 = 200_000;

fn clamp_f(v: f64, lo: f64, hi: f64, fallback: f64) -> f64 {
    if v.is_finite() {
        v.clamp(lo, hi)
    } else {
        fallback
    }
}

fn clean_name(s: &str, fallback: &str, max: usize) -> String {
    let t: String = s.chars().filter(|c| !c.is_control()).take(max).collect();
    let t = t.trim();
    if t.is_empty() {
        fallback.to_string()
    } else {
        t.to_string()
    }
}

fn clean_id(s: &str) -> Option<String> {
    let t: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(64).collect();
    (!t.is_empty()).then_some(t)
}

impl Step {
    pub fn sanitize(&mut self) -> bool {
        match self {
            Step::Press { input, hold_ms } => {
                *hold_ms = clamp_f(*hold_ms, 0.0, MAX_HOLD_MS, 15.0);
                input::is_valid(*input)
            }
            Step::Down { input } | Step::Up { input } => input::is_valid(*input) && !input::is_wheel(*input),
            Step::Wheel { delta, .. } => {
                *delta = (*delta).clamp(-100, 100);
                *delta != 0
            }
            Step::Move { dx, dy, duration_ms } => {
                *dx = (*dx).clamp(-MAX_MOVE, MAX_MOVE);
                *dy = (*dy).clamp(-MAX_MOVE, MAX_MOVE);
                *duration_ms = clamp_f(*duration_ms, 0.0, MAX_HOLD_MS, 0.0);
                true
            }
            Step::MoveTo { x, y } => {
                *x = (*x).clamp(-MAX_MOVE, MAX_MOVE);
                *y = (*y).clamp(-MAX_MOVE, MAX_MOVE);
                true
            }
            Step::Delay { ms, jitter_ms } => {
                *ms = clamp_f(*ms, 0.0, MAX_DELAY_MS, 0.0);
                *jitter_ms = clamp_f(*jitter_ms, 0.0, *ms, 0.0);
                true
            }
            Step::Text { text, char_delay_ms } => {
                *text = text.chars().filter(|c| *c == '\n' || *c == '\t' || !c.is_control()).take(MAX_TEXT).collect();
                *char_delay_ms = clamp_f(*char_delay_ms, 0.0, 10_000.0, 10.0);
                !text.is_empty()
            }
        }
    }
}

impl Action {
    pub fn sanitize(&mut self) -> bool {
        match self {
            Action::Macro { macro_id, repeat, .. } => {
                *repeat = (*repeat).clamp(1, MAX_REPEAT);
                match clean_id(macro_id) {
                    Some(id) => {
                        *macro_id = id;
                        true
                    }
                    None => false,
                }
            }
            Action::Rapid { output, rate, hold_ms, jitter_pct } => {
                *rate = clamp_f(*rate, MIN_RATE, MAX_RATE, 10.0);
                *hold_ms = clamp_f(*hold_ms, 0.0, MAX_HOLD_MS, 0.0);
                *jitter_pct = clamp_f(*jitter_pct, 0.0, 50.0, 0.0);
                input::is_valid(*output)
            }
            Action::Remap { output, mods } => {
                *mods &= MOD_ALL;
                input::is_valid(*output)
            }
            Action::HoldLock { output } => input::is_valid(*output) && !input::is_wheel(*output),
            Action::Block => true,
        }
    }
}

impl Hotkey {
    fn sanitize(&mut self) {
        if !input::is_valid(self.input) {
            self.input = 0;
        }
        self.mods &= MOD_ALL;
    }
}

impl Data {
    /// Clamp everything into range and drop what cannot run. Returns how many
    /// items were dropped, so the caller can log it.
    pub fn sanitize(&mut self) -> usize {
        let mut dropped = 0;
        if self.version < 2 && self.settings.accent == "violet" {
            // Version 1 defaulted to the family violet; MacroForge now has its own.
            self.settings.accent = "signal".into();
        }
        if self.version < 3 {
            for b in self.profiles.iter_mut().flat_map(|p| p.bindings.iter_mut()) {
                if let Action::Rapid { hold_ms, .. } = &mut b.action {
                    // 15 and 20 ms were the old defaults, short enough for a
                    // busy game to miss between frames.
                    if *hold_ms == 15.0 || *hold_ms == 20.0 {
                        *hold_ms = 0.0;
                    }
                }
            }
        }
        self.version = DATA_VERSION;

        let mut seen = std::collections::HashSet::new();
        self.macros.retain_mut(|m| {
            let Some(id) = clean_id(&m.id).filter(|id| seen.insert(id.clone())) else {
                dropped += 1;
                return false;
            };
            m.id = id;
            m.name = clean_name(&m.name, "Macro", 60);
            let before = m.steps.len();
            m.steps.truncate(MAX_STEPS);
            m.steps.retain_mut(Step::sanitize);
            dropped += before - m.steps.len();
            true
        });

        let mut seen = std::collections::HashSet::new();
        self.profiles.retain_mut(|p| {
            let Some(id) = clean_id(&p.id).filter(|id| seen.insert(id.clone())) else {
                dropped += 1;
                return false;
            };
            p.id = id;
            p.name = clean_name(&p.name, "Profile", 40);
            p.apps = p
                .apps
                .iter()
                .map(|a| a.trim().to_ascii_lowercase())
                .filter(|a| !a.is_empty() && a.len() <= 260 && !a.contains(['/', '\\']))
                .take(64)
                .collect();
            p.apps.dedup();
            let mut ids = std::collections::HashSet::new();
            let before = p.bindings.len();
            p.bindings.truncate(500);
            p.bindings.retain_mut(|b| {
                let Some(id) = clean_id(&b.id).filter(|id| ids.insert(id.clone())) else { return false };
                b.id = id;
                b.name = clean_name(&b.name, "", 60);
                b.trigger.mods &= MOD_ALL;
                // A trigger can be unset while the user is still building it;
                // it is kept (and simply never fires) so their work is not lost.
                if !input::is_valid(b.trigger.input) {
                    b.trigger.input = 0;
                }
                let c = &mut b.conditions;
                // Only rapid fire and macros run over time, so only they
                // can be gated. A held condition must be a holdable input
                // other than the trigger itself.
                if !matches!(b.action, Action::Rapid { .. } | Action::Macro { .. }) {
                    *c = Conditions::default();
                }
                if !input::is_valid(c.while_held) || input::is_wheel(c.while_held) || c.while_held == b.trigger.input {
                    c.while_held = 0;
                }
                b.action.sanitize()
            });
            dropped += before - p.bindings.len();
            true
        });
        if self.profiles.is_empty() {
            self.profiles.push(Profile::global());
        }

        let s = &mut self.settings;
        s.master_hotkey.sanitize();
        s.panic_hotkey.sanitize();
        // Left or right click as the on / off or stop-all key would take
        // over every normal click (and swallow it): back to the defaults.
        let defaults = Settings::default();
        for (hk, default) in [(&mut s.master_hotkey, defaults.master_hotkey), (&mut s.panic_hotkey, defaults.panic_hotkey)] {
            if hk.input == input::MOUSE_LEFT || hk.input == input::MOUSE_RIGHT {
                *hk = default;
            }
        }
        s.record_fixed_delay_ms = clamp_f(s.record_fixed_delay_ms, 0.0, 10_000.0, 30.0);
        s.sound_volume = s.sound_volume.min(100);
        let mut seen_games = std::collections::HashSet::new();
        s.turn_calibrations.retain_mut(|c| {
            let Some(id) = clean_id(&c.game) else { return false };
            c.game = id;
            c.yaw.is_finite() && c.yaw > 1e-7 && c.yaw < 100.0 && seen_games.insert(c.game.clone())
        });
        s.turn_calibrations.truncate(200);
        if !["signal", "violet", "blue", "teal", "green", "amber", "pink"].contains(&s.accent.as_str()) {
            s.accent = "signal".into();
        }
        dropped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_round_trips() {
        let d = Data::default();
        let json = serde_json::to_string(&d).unwrap();
        let back: Data = serde_json::from_str(&json).unwrap();
        assert_eq!(d, back);
    }

    #[test]
    fn action_json_shape_matches_ui() {
        let a = Action::Rapid { output: 256, rate: 12.0, hold_ms: 10.0, jitter_pct: 5.0 };
        let v = serde_json::to_value(&a).unwrap();
        assert_eq!(v["type"], "rapid");
        assert_eq!(v["holdMs"], 10.0);
        let s: Step = serde_json::from_str(r#"{"type":"delay","ms":20,"jitterMs":5}"#).unwrap();
        assert_eq!(s, Step::Delay { ms: 20.0, jitter_ms: 5.0 });
        let m: Action = serde_json::from_str(r#"{"type":"macro","macroId":"m1"}"#).unwrap();
        assert!(matches!(m, Action::Macro { repeat: 1, stop_immediately: true, .. }));
    }

    #[test]
    fn sanitize_clamps_and_drops() {
        let mut d = Data::default();
        d.profiles[0].bindings.push(Binding {
            id: "b1".into(),
            trigger: Trigger { input: 0x41, ..Default::default() },
            action: Action::Rapid { output: 256, rate: f64::NAN, hold_ms: 1e12, jitter_pct: 400.0 },
            ..Default::default()
        });
        d.profiles[0].bindings.push(Binding {
            id: "b2".into(),
            action: Action::Remap { output: 9999, mods: 0 },
            ..Default::default()
        });
        d.profiles[0].apps = vec!["  CS2.exe ".into(), "..\\evil".into()];
        d.macros.push(Macro {
            id: "m".into(),
            steps: vec![Step::Delay { ms: -5.0, jitter_ms: 9.0 }, Step::Wheel { delta: 0, horizontal: false }],
            ..Default::default()
        });
        let dropped = d.sanitize();
        assert_eq!(dropped, 2);
        let b = &d.profiles[0].bindings[0];
        assert_eq!(b.action, Action::Rapid { output: 256, rate: 10.0, hold_ms: MAX_HOLD_MS, jitter_pct: 50.0 });
        assert_eq!(d.profiles[0].apps, vec!["cs2.exe"]);
        assert_eq!(d.macros[0].steps, vec![Step::Delay { ms: 0.0, jitter_ms: 0.0 }]);
    }

    #[test]
    fn version_1_moves_to_the_signal_accent_once() {
        let mut d: Data = serde_json::from_str(r#"{"version":1,"settings":{"accent":"violet"}}"#).unwrap();
        d.sanitize();
        assert_eq!(d.settings.accent, "signal");
        assert_eq!(d.settings.sound_volume, 30);
        d.settings.accent = "violet".into();
        d.sanitize();
        assert_eq!(d.settings.accent, "violet", "a later choice of violet is kept");
    }

    #[test]
    fn version_2_rapid_defaults_become_auto() {
        let mut d = Data { version: 2, ..Default::default() };
        for (id, hold) in [("a", 15.0), ("b", 20.0), ("c", 40.0)] {
            d.profiles[0].bindings.push(Binding {
                id: id.into(),
                trigger: Trigger { input: 0x41, ..Default::default() },
                action: Action::Rapid { output: 256, rate: 10.0, hold_ms: hold, jitter_pct: 0.0 },
                ..Default::default()
            });
        }
        d.sanitize();
        let holds: Vec<f64> = d.profiles[0]
            .bindings
            .iter()
            .map(|b| match b.action {
                Action::Rapid { hold_ms, .. } => hold_ms,
                _ => -1.0,
            })
            .collect();
        assert_eq!(holds, vec![0.0, 0.0, 40.0], "a deliberate 40 ms is kept");
        assert_eq!(d.version, DATA_VERSION);
    }

    #[test]
    fn conditions_are_kept_only_where_they_make_sense() {
        let mut d = Data::default();
        let rapid = Action::Rapid { output: 256, rate: 10.0, hold_ms: 0.0, jitter_pct: 0.0 };
        let mk = |id: &str, input: Input, action: Action, held: Input| Binding {
            id: id.into(),
            trigger: Trigger { input, ..Default::default() },
            action,
            conditions: Conditions { while_held: held, pause_in_menus: true },
            ..Default::default()
        };
        d.profiles[0].bindings = vec![
            mk("ok", 256, rapid.clone(), 257),
            mk("self", 256, rapid.clone(), 256),
            mk("wheel", 256, rapid.clone(), crate::input::WHEEL_UP),
            mk("remap", 0x41, Action::Remap { output: 0x42, mods: 0 }, 257),
        ];
        d.sanitize();
        let c: Vec<Conditions> = d.profiles[0].bindings.iter().map(|b| b.conditions).collect();
        assert_eq!(c[0], Conditions { while_held: 257, pause_in_menus: true });
        assert_eq!(c[1], Conditions { while_held: 0, pause_in_menus: true }, "not its own trigger");
        assert_eq!(c[2].while_held, 0, "a wheel notch cannot be held");
        assert_eq!(c[3], Conditions::default(), "a remap is instant");
        // Old saves without the field load with both off.
        let b: Binding = serde_json::from_str(r#"{"id":"x","action":{"type":"block"}}"#).unwrap();
        assert!(!b.conditions.any());
    }

    #[test]
    fn left_or_right_click_cannot_be_a_hotkey() {
        let mut d = Data::default();
        d.settings.master_hotkey = Hotkey { input: input::MOUSE_LEFT, mods: 0 };
        d.settings.panic_hotkey = Hotkey { input: input::MOUSE_RIGHT, mods: 0 };
        d.sanitize();
        assert_eq!(d.settings.master_hotkey, Settings::default().master_hotkey);
        assert_eq!(d.settings.panic_hotkey, Settings::default().panic_hotkey);
        d.settings.master_hotkey = Hotkey { input: input::MOUSE_X1, mods: 0 };
        d.sanitize();
        assert_eq!(d.settings.master_hotkey.input, input::MOUSE_X1, "side buttons are fine");
    }

    #[test]
    fn corrupt_fields_fall_back_to_defaults() {
        let d: Data = serde_json::from_str(r#"{"settings":{"timing":"efficient"}}"#).unwrap();
        assert_eq!(d.settings.timing, TimingMode::Efficient);
        assert_eq!(d.settings.master_hotkey.input, 0x91);
    }
}
