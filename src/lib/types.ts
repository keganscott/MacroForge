// Mirrors crates/engine/src/model.rs and engine.rs (serde camelCase). Keep in
// step with the Rust types: the Rust side sanitizes everything it receives,
// so a mismatch shows up as a value snapping back, never as bad input.

export type Input = number;
export type TriggerMode = "press" | "hold" | "toggle";
export type Repress = "ignore" | "restart" | "stop";

export interface Trigger {
  input: Input;
  mods: number;
  mode: TriggerMode;
  passthrough: boolean;
}

export type Action =
  | { type: "macro"; macroId: string; repeat: number; onRepress: Repress; stopImmediately: boolean }
  | { type: "rapid"; output: Input; rate: number; holdMs: number; jitterPct: number }
  | { type: "remap"; output: Input; mods: number }
  | { type: "holdLock"; output: Input }
  | { type: "block" };

export type ActionType = Action["type"];

/** When a rapid fire or macro binding may fire. Both off = always. */
export interface Conditions {
  /** Only while this key / button is held (0 = off), e.g. right click to aim. */
  whileHeld: Input;
  /** Pause while the mouse cursor is showing (inventory, map, menus). */
  pauseInMenus: boolean;
}

export const NO_CONDITIONS: Conditions = { whileHeld: 0, pauseInMenus: false };

export interface Binding {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  action: Action;
  /** Missing on bindings made before conditions existed: treat as none. */
  conditions?: Conditions;
}

export interface Profile {
  id: string;
  name: string;
  enabled: boolean;
  apps: string[];
  bindings: Binding[];
}

export type Step =
  | { type: "press"; input: Input; holdMs: number }
  | { type: "down"; input: Input }
  | { type: "up"; input: Input }
  | { type: "wheel"; delta: number; horizontal: boolean }
  | { type: "move"; dx: number; dy: number; durationMs: number }
  | { type: "moveTo"; x: number; y: number }
  | { type: "delay"; ms: number; jitterMs: number }
  | { type: "text"; text: string; charDelayMs: number };

export type StepType = Step["type"];

export interface Macro {
  id: string;
  name: string;
  steps: Step[];
}

export interface Hotkey {
  input: Input;
  mods: number;
}

export type HudPosition = "topLeft" | "topCenter" | "topRight" | "bottomLeft" | "bottomRight";
export type RecordTiming = "real" | "fixed" | "none";
export type TimingMode = "efficient" | "precise";
export type SoundStyle = "click" | "chime" | "pop";
export type Accent = "signal" | "violet" | "blue" | "teal" | "green" | "amber" | "pink";

export interface Settings {
  masterHotkey: Hotkey;
  panicHotkey: Hotkey;
  timing: TimingMode;
  armedOnLaunch: boolean;
  ignoreForeignInjected: boolean;
  hud: boolean;
  hudPosition: HudPosition;
  sounds: boolean;
  soundStyle: SoundStyle;
  soundVolume: number;
  closeToTray: boolean;
  startMinimized: boolean;
  startWithWindows: boolean;
  accent: Accent;
  recordTiming: RecordTiming;
  recordFixedDelayMs: number;
  recordMouseMoves: boolean;
  seenWelcome: boolean;
}

export interface Data {
  version: number;
  profiles: Profile[];
  macros: Macro[];
  settings: Settings;
}

export interface RunInfo {
  id: string;
  label: string;
  mode: TriggerMode;
  startedMs: number;
}

export interface Status {
  armed: boolean;
  foreground: string | null;
  foregroundElevated: boolean | null;
  selfElevated: boolean;
  pausedOwnWindow: boolean;
  activeProfiles: string[];
  liveBindings: number;
  running: RunInfo[];
  locks: string[];
  hook: { keyboard: boolean; mouse: boolean };
  recording: boolean;
  monitoring: boolean;
}

export interface Stats {
  hookEvents: number;
  hookAvgUs: number;
  hookMaxUs: number;
  latencySamples: number;
  latencyP50Us: number;
  latencyP99Us: number;
  latencyMaxUs: number;
  sendFailures: number;
  rapidLabel: string;
  rapidTargetMs: number;
  rapidHoldMs: number;
  rapidPresses: number;
  rapidLateP50Us: number;
  rapidLateP99Us: number;
  rapidLateMaxUs: number;
}

export interface BenchRow {
  label: string;
  targetMs: number;
  samples: number;
  meanLateUs: number;
  p99LateUs: number;
  maxLateUs: number;
}

export interface MonitorEvent {
  input: Input;
  down: boolean;
  injected: boolean;
  t: number;
}

export interface Hud {
  text: string;
  on: boolean;
}

export interface Snapshot {
  data: Data;
  status: Status;
  warning: string | null;
  dataDir: string;
  version: string;
  autostart: boolean;
}

export interface AppEntry {
  exe: string;
  title: string;
}
