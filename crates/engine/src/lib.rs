//! MacroForge engine: input hooks, triggers, macro playback, precise timing.
//! No Tauri dependency; the Windows layer is in `win`, everything else is
//! platform independent and tested on its own.

pub mod bench;
pub mod engine;
pub mod gate;
pub mod input;
pub mod model;
pub mod recorder;
pub mod runner;
pub mod store;
pub mod table;
pub mod timing;

#[cfg(windows)]
pub mod win;

pub use engine::{Engine, Foreground, Hud, MonitorEvent, Notifier, Platform, Stats, Status};
pub use model::*;
