//! The trigger table the input hook reads. Built from the user's data and the
//! app in front; rebuilt whenever either changes, then swapped in whole, so
//! the hook never sees a half-built table and never waits on a lock writer
//! for longer than one pointer swap.

use std::collections::HashMap;
use std::sync::Arc;

use crate::input::{self, Input, INPUT_COUNT};
use crate::model::{Action, Conditions, Data, Repress, Step, Trigger, TriggerMode};

#[derive(Debug, Clone, PartialEq)]
pub enum Compiled {
    Macro { steps: Arc<Vec<Step>>, repeat: u32, on_repress: Repress, stop_immediately: bool },
    Rapid { output: Input, rate: f64, hold_ms: f64, jitter_pct: f64 },
    Remap { output: Input, mods: u8 },
    HoldLock { output: Input },
    Block,
}

#[derive(Debug)]
pub struct Bound {
    pub id: Arc<str>,
    pub profile_id: Arc<str>,
    /// What the HUD and status call it: the binding's name, else its macro's name.
    pub label: String,
    pub trigger: Trigger,
    pub action: Compiled,
    pub conditions: Conditions,
    /// From a profile limited to certain apps (wins over an "everywhere" one).
    pub specific: bool,
}

impl Bound {
    /// Required modifiers, not counting the trigger key's own bit (Ctrl as a
    /// trigger is "Ctrl", not "Ctrl+Ctrl").
    pub fn required_mods(&self) -> u8 {
        self.trigger.mods & !input::modifier_bit(self.trigger.input)
    }
}

#[derive(Default)]
pub struct Table {
    slots: Vec<Vec<Arc<Bound>>>,
    pub bindings: Vec<Arc<Bound>>,
    /// Profiles in effect for the app in front.
    pub active_profiles: Vec<String>,
    pub uses_mouse: bool,
}

impl Table {
    pub fn empty() -> Self {
        Table { slots: vec![Vec::new(); INPUT_COUNT], ..Default::default() }
    }

    /// The binding `code` fires with modifiers `mods` held, if any. Slots are
    /// sorted most specific first, so the first match wins.
    pub fn lookup(&self, code: Input, mods: u8) -> Option<&Arc<Bound>> {
        self.lookup_where(code, mods, |_| true)
    }

    /// The first matching binding that `allowed` accepts. A binding whose
    /// conditions are not met is skipped, so the next one on that key (or
    /// the plain key itself) gets the press instead.
    pub fn lookup_where(&self, code: Input, mods: u8, mut allowed: impl FnMut(&Bound) -> bool) -> Option<&Arc<Bound>> {
        let slot = self.slots.get(code as usize)?;
        let mods = mods & !input::modifier_bit(code);
        slot.iter().find(|b| b.required_mods() & mods == b.required_mods() && allowed(b))
    }

    pub fn contains(&self, id: &str) -> bool {
        self.bindings.iter().any(|b| &*b.id == id)
    }
}

/// Does a profile apply while `exe` (lower case file name) is in front?
pub fn profile_applies(apps: &[String], exe: Option<&str>) -> bool {
    apps.is_empty() || exe.is_some_and(|e| apps.iter().any(|a| a == e))
}

pub fn compile(data: &Data, exe: Option<&str>) -> Table {
    let mut table = Table::empty();
    let macros: HashMap<&str, (&str, Arc<Vec<Step>>)> =
        data.macros.iter().map(|m| (m.id.as_str(), (m.name.as_str(), Arc::new(m.steps.clone())))).collect();

    for p in data.profiles.iter().filter(|p| p.enabled) {
        if !profile_applies(&p.apps, exe) {
            continue;
        }
        table.active_profiles.push(p.id.clone());
        let pid: Arc<str> = Arc::from(p.id.as_str());
        for b in p.bindings.iter().filter(|b| b.enabled && input::is_valid(b.trigger.input)) {
            let mut trigger = b.trigger;
            let fallback;
            let action = match &b.action {
                Action::Macro { macro_id, repeat, on_repress, stop_immediately } => {
                    let Some((name, steps)) = macros.get(macro_id.as_str()) else { continue };
                    fallback = name.to_string();
                    Compiled::Macro {
                        steps: steps.clone(),
                        repeat: *repeat,
                        on_repress: *on_repress,
                        stop_immediately: *stop_immediately,
                    }
                }
                Action::Rapid { output, rate, hold_ms, jitter_pct } => {
                    fallback = format!("Rapid {}", input::name(*output));
                    // Rapid fire runs while held or toggled; a single press
                    // of it means "while held".
                    if trigger.mode == TriggerMode::Press {
                        trigger.mode = TriggerMode::Hold;
                    }
                    Compiled::Rapid { output: *output, rate: *rate, hold_ms: *hold_ms, jitter_pct: *jitter_pct }
                }
                Action::Remap { output, mods } => {
                    fallback = format!("{}{}", input::mods_name(*mods), input::name(*output));
                    Compiled::Remap { output: *output, mods: *mods }
                }
                Action::HoldLock { output } => {
                    fallback = format!("Hold {}", input::name(*output));
                    Compiled::HoldLock { output: *output }
                }
                Action::Block => {
                    fallback = format!("Block {}", input::name(trigger.input));
                    Compiled::Block
                }
            };
            // A wheel notch has no release, so it cannot be held.
            if input::is_wheel(trigger.input) && trigger.mode == TriggerMode::Hold {
                trigger.mode = TriggerMode::Press;
            }
            if input::is_mouse_button(trigger.input)
                || input::is_wheel(trigger.input)
                || input::is_mouse_button(b.conditions.while_held)
            {
                table.uses_mouse = true;
            }
            let label = if b.name.is_empty() { fallback } else { b.name.clone() };
            let bound = Arc::new(Bound {
                id: Arc::from(b.id.as_str()),
                profile_id: pid.clone(),
                label,
                trigger,
                action,
                conditions: b.conditions,
                specific: !p.apps.is_empty(),
            });
            table.slots[trigger.input as usize].push(bound.clone());
            table.bindings.push(bound);
        }
    }
    for slot in &mut table.slots {
        // Stable: among equals, the earlier profile / binding wins.
        slot.sort_by_key(|b| (std::cmp::Reverse(b.specific), std::cmp::Reverse(b.required_mods().count_ones())));
    }
    table
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{MOD_CTRL, MOD_SHIFT};
    use crate::model::{Binding, Macro, Profile};

    fn bind(id: &str, input: Input, mods: u8, action: Action) -> Binding {
        Binding { id: id.into(), trigger: Trigger { input, mods, ..Default::default() }, action, ..Default::default() }
    }

    fn data() -> Data {
        let mut d = Data::default();
        d.profiles[0].bindings = vec![
            bind("plain", 0x41, 0, Action::Block),
            bind("ctrl", 0x41, MOD_CTRL, Action::Remap { output: 0x42, mods: 0 }),
            bind("nomacro", 0x43, 0, Action::Macro { macro_id: "missing".into(), repeat: 1, on_repress: Repress::Ignore, stop_immediately: true }),
            bind("m", 0x44, 0, Action::Macro { macro_id: "m1".into(), repeat: 1, on_repress: Repress::Ignore, stop_immediately: true }),
        ];
        d.profiles.push(Profile {
            id: "cs".into(),
            apps: vec!["cs2.exe".into()],
            bindings: vec![bind("game", 0x41, 0, Action::HoldLock { output: 0x57 }), bind("x1", 259, 0, Action::Block)],
            ..Default::default()
        });
        d.macros.push(Macro { id: "m1".into(), name: "Combo".into(), steps: vec![] });
        d
    }

    #[test]
    fn most_specific_wins() {
        let t = compile(&data(), None);
        assert_eq!(&*t.lookup(0x41, 0).unwrap().id, "plain");
        assert_eq!(&*t.lookup(0x41, MOD_CTRL).unwrap().id, "ctrl");
        assert_eq!(&*t.lookup(0x41, MOD_CTRL | MOD_SHIFT).unwrap().id, "ctrl");
        assert!(!t.uses_mouse);
        let t = compile(&data(), Some("cs2.exe"));
        assert_eq!(&*t.lookup(0x41, 0).unwrap().id, "game");
        assert!(t.uses_mouse);
        assert_eq!(t.active_profiles, vec!["global", "cs"]);
    }

    #[test]
    fn missing_macro_is_skipped_and_labels_fall_back() {
        let t = compile(&data(), None);
        assert!(t.lookup(0x43, 0).is_none());
        assert_eq!(t.lookup(0x44, 0).unwrap().label, "Combo");
    }

    #[test]
    fn modifier_trigger_ignores_its_own_bit() {
        let mut d = Data::default();
        d.profiles[0].bindings = vec![bind("c", 0xA2, MOD_CTRL, Action::Block)];
        let t = compile(&d, None);
        assert!(t.lookup(0xA2, MOD_CTRL).is_some());
        assert!(t.lookup(0xA2, 0).is_some());
    }

    #[test]
    fn rapid_press_means_hold() {
        let mut d = Data::default();
        d.profiles[0].bindings =
            vec![bind("r", 256, 0, Action::Rapid { output: 256, rate: 10.0, hold_ms: 10.0, jitter_pct: 0.0 })];
        let t = compile(&d, None);
        assert_eq!(t.lookup(256, 0).unwrap().trigger.mode, TriggerMode::Hold);
    }
}
