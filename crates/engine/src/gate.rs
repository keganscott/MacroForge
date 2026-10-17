//! The decision the input hook makes for every key and button event: pass it
//! on, or swallow it and tell the engine. Kept free of Win32 so it is tested
//! directly; `win::hook` only translates hook structs into calls to `Gate`.
//!
//! The hook runs inside Windows' input path, so this must be quick: no
//! allocation on the common path, no blocking, one read-lock to fetch the
//! current table (writers only swap a pointer).

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;

use crossbeam_channel::Sender;
use parking_lot::RwLock;

use crate::input::{self, Input, INPUT_COUNT};
use crate::model::Hotkey;
use crate::table::{Bound, Table};
use crate::timing::now_ms;

/// Messages the hook thread sends to the engine thread.
#[derive(Debug)]
pub enum HookMsg {
    Trigger { bound: Arc<Bound>, down: bool, repeat: bool, t: f64 },
    MasterHotkey,
    PanicHotkey,
    Captured { input: Input, mods: u8 },
    Record { input: Input, down: bool, t: f64 },
    RecordMove { dx: i32, dy: i32, t: f64 },
    Monitor { input: Input, down: bool, injected: bool, t: f64 },
    /// The window in front changed (Win32 handle as an integer).
    Foreground(isize),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    Physical,
    /// Injected by MacroForge itself (tagged with `INJECT_TAG`).
    Ours,
    /// Injected by another program.
    Foreign,
}

/// Marks MacroForge's own SendInput events (`dwExtraInfo`), so the hook lets
/// them straight through instead of treating them as triggers.
pub const INJECT_TAG: usize = 0x4D46_5247; // "MFRG"

fn pack(h: Hotkey) -> u32 {
    (h.input as u32) | ((h.mods as u32) << 16)
}

/// State shared between the engine (writer) and the hook thread (reader).
pub struct Shared {
    pub table: RwLock<Arc<Table>>,
    pub armed: AtomicBool,
    pub capture: AtomicBool,
    pub recording: AtomicBool,
    pub record_moves: AtomicBool,
    pub monitor: AtomicBool,
    /// MacroForge's own window is in front: the recorder ignores input then,
    /// so clicking Stop is not recorded.
    pub own_foreground: AtomicBool,
    pub ignore_foreign: AtomicBool,
    master: AtomicU32,
    panic: AtomicU32,
    pub tx: Sender<HookMsg>,
    // Hook cost, for the Performance view.
    pub events: AtomicU64,
    pub busy_ns: AtomicU64,
    pub max_ns: AtomicU64,
}

impl Shared {
    pub fn new(tx: Sender<HookMsg>) -> Self {
        Shared {
            table: RwLock::new(Arc::new(Table::empty())),
            armed: AtomicBool::new(false),
            capture: AtomicBool::new(false),
            recording: AtomicBool::new(false),
            record_moves: AtomicBool::new(false),
            monitor: AtomicBool::new(false),
            own_foreground: AtomicBool::new(false),
            ignore_foreign: AtomicBool::new(true),
            master: AtomicU32::new(0),
            panic: AtomicU32::new(0),
            tx,
            events: AtomicU64::new(0),
            busy_ns: AtomicU64::new(0),
            max_ns: AtomicU64::new(0),
        }
    }

    pub fn set_hotkeys(&self, master: Hotkey, panic: Hotkey) {
        self.master.store(pack(master), Ordering::Relaxed);
        self.panic.store(pack(panic), Ordering::Relaxed);
    }

    pub fn note_cost(&self, ns: u64) {
        self.events.fetch_add(1, Ordering::Relaxed);
        self.busy_ns.fetch_add(ns, Ordering::Relaxed);
        self.max_ns.fetch_max(ns, Ordering::Relaxed);
    }

    /// Mouse events only need hooking when something listens for them.
    pub fn wants_mouse(&self) -> bool {
        let hk = |v: u32| {
            let code = (v & 0xFFFF) as Input;
            input::is_mouse_button(code) || input::is_wheel(code)
        };
        (self.armed.load(Ordering::Relaxed) && self.table.read().uses_mouse)
            || self.capture.load(Ordering::Relaxed)
            || self.recording.load(Ordering::Relaxed)
            || self.monitor.load(Ordering::Relaxed)
            || hk(self.master.load(Ordering::Relaxed))
            || hk(self.panic.load(Ordering::Relaxed))
    }
}

/// Per-input state only the hook thread touches.
pub struct Gate {
    down: Vec<bool>,
    /// The binding a press was matched to, so its release goes to the same
    /// binding (and is swallowed the same way) even if the table changed or a
    /// modifier was let go in between.
    matched: Vec<Option<Arc<Bound>>>,
    /// Releases to swallow because their press was (hotkey, capture).
    swallow_up: Vec<bool>,
    last_pt: Option<(i32, i32)>,
    /// Capture: a modifier is down and may be the start of a chord.
    capture_mod: Option<Input>,
}

impl Default for Gate {
    fn default() -> Self {
        Gate {
            down: vec![false; INPUT_COUNT],
            matched: vec![None; INPUT_COUNT],
            swallow_up: vec![false; INPUT_COUNT],
            last_pt: None,
            capture_mod: None,
        }
    }
}

impl Gate {
    pub fn mods(&self) -> u8 {
        let d = |vk: usize| self.down[vk];
        let mut m = 0;
        if d(0xA2) || d(0xA3) || d(0x11) {
            m |= input::MOD_CTRL;
        }
        if d(0xA0) || d(0xA1) || d(0x10) {
            m |= input::MOD_SHIFT;
        }
        if d(0xA4) || d(0xA5) || d(0x12) {
            m |= input::MOD_ALT;
        }
        if d(0x5B) || d(0x5C) {
            m |= input::MOD_WIN;
        }
        m
    }

    pub fn is_down(&self, code: Input) -> bool {
        self.down.get(code as usize).copied().unwrap_or(false)
    }

    fn hotkey_hit(&self, packed: u32, code: Input, mods: u8) -> bool {
        let (hk, hm) = ((packed & 0xFFFF) as Input, (packed >> 16) as u8);
        hk != 0 && hk == code && (mods & !input::modifier_bit(code)) & hm == hm
    }

    /// Handle one key / button / wheel event. Returns `true` to swallow it.
    pub fn on_input(&mut self, sh: &Shared, code: Input, down: bool, origin: Origin) -> bool {
        let i = code as usize;
        if i >= INPUT_COUNT || code == 0 {
            return false;
        }
        match origin {
            Origin::Ours => return false,
            Origin::Foreign if sh.ignore_foreign.load(Ordering::Relaxed) => return false,
            _ => {}
        }
        let momentary = input::is_momentary(code);
        let repeat = down && !momentary && self.down[i];
        if !momentary {
            self.down[i] = down;
        }
        let mods = self.mods();
        let t = now_ms();

        if sh.monitor.load(Ordering::Relaxed) && !repeat {
            let _ = sh.tx.send(HookMsg::Monitor { input: code, down, injected: origin != Origin::Physical, t });
        }

        if !down && self.swallow_up[i] {
            self.swallow_up[i] = false;
            return true;
        }

        if sh.capture.load(Ordering::Acquire) {
            // Left / right click work the UI (Cancel, the key list), so they
            // are never captured; Esc cancels (reported as input 0).
            if code == input::MOUSE_LEFT || code == input::MOUSE_RIGHT {
                return false;
            }
            if code == 0x1B && down && !repeat && sh.capture.swap(false, Ordering::AcqRel) {
                self.capture_mod = None;
                let _ = sh.tx.send(HookMsg::Captured { input: 0, mods: 0 });
                self.swallow_up[i] = true;
                return true;
            }
            let is_mod = input::modifier_bit(code) != 0;
            if down && !repeat && is_mod {
                // Could be the start of a chord (Ctrl+F): wait and see.
                self.capture_mod = Some(code);
                return false;
            }
            let chosen = if down && !repeat && !is_mod {
                Some((code, mods))
            } else if !down && self.capture_mod == Some(code) {
                // A modifier pressed and released on its own is the trigger.
                Some((code, 0))
            } else {
                None
            };
            if let Some((input, mods)) = chosen {
                if sh.capture.swap(false, Ordering::AcqRel) {
                    self.capture_mod = None;
                    let _ = sh.tx.send(HookMsg::Captured { input, mods: mods & !input::modifier_bit(input) });
                    if down && !momentary {
                        self.swallow_up[i] = true;
                    }
                    return down;
                }
            }
        } else {
            self.capture_mod = None;
        }

        if sh.recording.load(Ordering::Relaxed) && !repeat && !sh.own_foreground.load(Ordering::Relaxed) {
            let _ = sh.tx.send(HookMsg::Record { input: code, down, t });
        }

        if down && !repeat {
            let hit = if self.hotkey_hit(sh.master.load(Ordering::Relaxed), code, mods) {
                Some(HookMsg::MasterHotkey)
            } else if self.hotkey_hit(sh.panic.load(Ordering::Relaxed), code, mods) {
                Some(HookMsg::PanicHotkey)
            } else {
                None
            };
            if let Some(msg) = hit {
                let _ = sh.tx.send(msg);
                if !momentary {
                    self.swallow_up[i] = true;
                }
                return true;
            }
        }

        if !down {
            return match self.matched[i].take() {
                Some(b) => {
                    let swallow = !b.trigger.passthrough;
                    let _ = sh.tx.send(HookMsg::Trigger { bound: b, down: false, repeat: false, t });
                    swallow
                }
                None => false,
            };
        }

        if repeat {
            // Keyboard auto-repeat of a matched key: only a remap passes it on.
            return match &self.matched[i] {
                Some(b) => {
                    if matches!(b.action, crate::table::Compiled::Remap { .. }) {
                        let _ = sh.tx.send(HookMsg::Trigger { bound: b.clone(), down: true, repeat: true, t });
                    }
                    !b.trigger.passthrough
                }
                None => false,
            };
        }

        if !sh.armed.load(Ordering::Relaxed) {
            return false;
        }
        let table = sh.table.read().clone();
        let Some(b) = table.lookup(code, mods) else { return false };
        let swallow = !b.trigger.passthrough;
        if momentary {
            let _ = sh.tx.send(HookMsg::Trigger { bound: b.clone(), down: true, repeat: false, t });
            let _ = sh.tx.send(HookMsg::Trigger { bound: b.clone(), down: false, repeat: false, t });
        } else {
            self.matched[i] = Some(b.clone());
            let _ = sh.tx.send(HookMsg::Trigger { bound: b.clone(), down: true, repeat: false, t });
        }
        swallow
    }

    /// Mouse movement, absolute cursor position. Only used for recording.
    pub fn on_move(&mut self, sh: &Shared, x: i32, y: i32, origin: Origin) {
        if origin == Origin::Ours {
            return;
        }
        let rec = sh.recording.load(Ordering::Relaxed)
            && sh.record_moves.load(Ordering::Relaxed)
            && !sh.own_foreground.load(Ordering::Relaxed);
        if !rec {
            self.last_pt = None;
            return;
        }
        if let Some((lx, ly)) = self.last_pt {
            let (dx, dy) = (x - lx, y - ly);
            if dx != 0 || dy != 0 {
                let _ = sh.tx.send(HookMsg::RecordMove { dx, dy, t: now_ms() });
            }
        }
        self.last_pt = Some((x, y));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{MOD_CTRL, WHEEL_UP};
    use crate::model::{Action, Binding, Data, Trigger};
    use crate::table::compile;
    use crossbeam_channel::{unbounded, Receiver};

    fn setup(bindings: Vec<Binding>) -> (Shared, Receiver<HookMsg>, Gate) {
        let (tx, rx) = unbounded();
        let sh = Shared::new(tx);
        let mut d = Data::default();
        d.profiles[0].bindings = bindings;
        *sh.table.write() = Arc::new(compile(&d, None));
        sh.armed.store(true, Ordering::Relaxed);
        sh.set_hotkeys(d.settings.master_hotkey, d.settings.panic_hotkey);
        (sh, rx, Gate::default())
    }

    fn b(id: &str, input: Input, mods: u8, passthrough: bool) -> Binding {
        Binding {
            id: id.into(),
            trigger: Trigger { input, mods, passthrough, ..Default::default() },
            action: Action::Remap { output: 0x42, mods: 0 },
            ..Default::default()
        }
    }

    fn triggers(rx: &Receiver<HookMsg>) -> Vec<(String, bool, bool)> {
        rx.try_iter()
            .filter_map(|m| match m {
                HookMsg::Trigger { bound, down, repeat, .. } => Some((bound.id.to_string(), down, repeat)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn press_and_release_pair_up_even_if_modifier_released_first() {
        let (sh, rx, mut g) = setup(vec![b("c", 0x41, MOD_CTRL, false)]);
        assert!(!g.on_input(&sh, 0xA2, true, Origin::Physical));
        assert!(g.on_input(&sh, 0x41, true, Origin::Physical));
        assert!(g.on_input(&sh, 0x41, true, Origin::Physical)); // auto-repeat
        assert!(!g.on_input(&sh, 0xA2, false, Origin::Physical));
        assert!(g.on_input(&sh, 0x41, false, Origin::Physical)); // still swallowed
        assert_eq!(
            triggers(&rx),
            vec![("c".into(), true, false), ("c".into(), true, true), ("c".into(), false, false)]
        );
    }

    #[test]
    fn passthrough_and_unbound_keys_pass() {
        let (sh, rx, mut g) = setup(vec![b("p", 0x41, 0, true)]);
        assert!(!g.on_input(&sh, 0x41, true, Origin::Physical));
        assert!(!g.on_input(&sh, 0x41, false, Origin::Physical));
        assert!(!g.on_input(&sh, 0x5A, true, Origin::Physical));
        assert_eq!(triggers(&rx).len(), 2);
    }

    #[test]
    fn own_injected_input_is_invisible() {
        let (sh, rx, mut g) = setup(vec![b("a", 0x41, 0, false)]);
        assert!(!g.on_input(&sh, 0x41, true, Origin::Ours));
        assert!(!g.is_down(0x41));
        assert!(!g.on_input(&sh, 0x41, true, Origin::Foreign));
        sh.ignore_foreign.store(false, Ordering::Relaxed);
        assert!(g.on_input(&sh, 0x41, true, Origin::Foreign));
        assert_eq!(triggers(&rx).len(), 1);
    }

    #[test]
    fn disarmed_passes_but_finishes_a_held_binding() {
        let (sh, rx, mut g) = setup(vec![b("a", 0x41, 0, false)]);
        assert!(g.on_input(&sh, 0x41, true, Origin::Physical));
        sh.armed.store(false, Ordering::Relaxed);
        assert!(g.on_input(&sh, 0x41, false, Origin::Physical));
        assert!(!g.on_input(&sh, 0x41, true, Origin::Physical));
        assert_eq!(triggers(&rx).len(), 2);
    }

    #[test]
    fn hotkeys_and_capture_are_swallowed_with_their_release() {
        let (sh, rx, mut g) = setup(vec![]);
        assert!(g.on_input(&sh, 0x91, true, Origin::Physical));
        assert!(g.on_input(&sh, 0x91, false, Origin::Physical));
        sh.capture.store(true, Ordering::Relaxed);
        assert!(!g.on_input(&sh, 256, true, Origin::Physical));
        assert!(!g.on_input(&sh, 256, false, Origin::Physical));
        assert!(g.on_input(&sh, 259, true, Origin::Physical));
        assert!(g.on_input(&sh, 259, false, Origin::Physical));
        assert!(!g.on_input(&sh, 259, true, Origin::Physical));
        let msgs: Vec<_> = rx.try_iter().collect();
        assert!(matches!(msgs[0], HookMsg::MasterHotkey));
        assert!(matches!(msgs[1], HookMsg::Captured { input: 259, mods: 0 }));
        assert_eq!(msgs.len(), 2);
    }

    #[test]
    fn capture_takes_chords_and_lone_modifiers() {
        let (sh, rx, mut g) = setup(vec![]);
        sh.capture.store(true, Ordering::Relaxed);
        assert!(!g.on_input(&sh, 0xA2, true, Origin::Physical));
        assert!(g.on_input(&sh, 0x46, true, Origin::Physical));
        assert!(g.on_input(&sh, 0x46, false, Origin::Physical));
        assert!(!g.on_input(&sh, 0xA2, false, Origin::Physical));
        sh.capture.store(true, Ordering::Relaxed);
        assert!(!g.on_input(&sh, 256, true, Origin::Physical), "left click is never captured");
        assert!(!g.on_input(&sh, 256, false, Origin::Physical));
        assert!(!g.on_input(&sh, 0xA0, true, Origin::Physical));
        assert!(!g.on_input(&sh, 0xA0, false, Origin::Physical));
        sh.capture.store(true, Ordering::Relaxed);
        assert!(g.on_input(&sh, 0x1B, true, Origin::Physical), "Esc cancels");
        assert!(g.on_input(&sh, 0x1B, false, Origin::Physical));
        let got: Vec<_> = rx
            .try_iter()
            .filter_map(|m| match m {
                HookMsg::Captured { input, mods } => Some((input, mods)),
                _ => None,
            })
            .collect();
        assert_eq!(got, vec![(0x46, MOD_CTRL), (0xA0, 0), (0, 0)]);
    }

    #[test]
    fn mouse_hook_only_while_armed_or_needed() {
        let (sh, _rx, _g) = setup(vec![b("m", 259, 0, false)]);
        assert!(sh.wants_mouse());
        sh.armed.store(false, Ordering::Relaxed);
        assert!(!sh.wants_mouse(), "bindings off: no mouse hook");
        sh.capture.store(true, Ordering::Relaxed);
        assert!(sh.wants_mouse(), "capturing a key still needs mouse buttons");
    }

    #[test]
    fn wheel_fires_down_and_up_at_once() {
        let (sh, rx, mut g) = setup(vec![b("w", WHEEL_UP, 0, false)]);
        assert!(g.on_input(&sh, WHEEL_UP, true, Origin::Physical));
        assert!(g.on_input(&sh, WHEEL_UP, true, Origin::Physical));
        assert_eq!(triggers(&rx).len(), 4);
    }
}
