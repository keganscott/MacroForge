// Typed client for the Rust commands (src-tauri/src/commands.rs). In a plain
// browser (npm run dev) it uses the SAMPLE mock instead, and the UI says so.

import type { AppEntry, BenchRow, Data, Hud, MonitorEvent, Snapshot, Stats, Status, Step } from "./types";

export interface Backend {
  sample: boolean;
  getSnapshot(): Promise<Snapshot>;
  saveData(data: Data): Promise<Data>;
  setArmed(armed: boolean | null): Promise<void>;
  panicStop(): Promise<void>;
  captureInput(timeoutMs: number): Promise<{ input: number; mods: number } | null>;
  cancelCapture(): Promise<void>;
  recordStart(): Promise<void>;
  recordStop(): Promise<Step[]>;
  playSteps(id: string, label: string, steps: Step[]): Promise<void>;
  stopRun(id: string): Promise<void>;
  setMonitor(on: boolean): Promise<void>;
  getStatus(): Promise<Status>;
  getStats(): Promise<Stats>;
  resetStats(): Promise<void>;
  runBenchmark(): Promise<BenchRow[]>;
  listApps(): Promise<AppEntry[]>;
  relaunchAdmin(): Promise<boolean>;
  openDataDir(): Promise<void>;
  previewHud(): Promise<void>;
  onStatus(cb: (s: Status) => void): () => void;
  onMonitor(cb: (e: MonitorEvent[]) => void): () => void;
  onRecorded(cb: (n: number) => void): () => void;
  onHud(cb: (h: Hud) => void): () => void;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function tauriBackend(): Promise<Backend> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const sub = <T,>(name: string, cb: (p: T) => void) => {
    let off: (() => void) | null = null;
    let dead = false;
    void listen<T>(name, (e) => cb(e.payload)).then((u) => (dead ? u() : (off = u)));
    return () => {
      dead = true;
      off?.();
    };
  };
  return {
    sample: false,
    getSnapshot: () => invoke("get_snapshot"),
    saveData: (data) => invoke("save_data", { data }),
    setArmed: (armed) => invoke("set_armed", { armed }),
    panicStop: () => invoke("panic_stop"),
    captureInput: (timeoutMs) => invoke("capture_input", { timeoutMs }),
    cancelCapture: () => invoke("cancel_capture"),
    recordStart: () => invoke("record_start"),
    recordStop: () => invoke("record_stop"),
    playSteps: (id, label, steps) => invoke("play_steps", { id, label, steps }),
    stopRun: (id) => invoke("stop_run", { id }),
    setMonitor: (on) => invoke("set_monitor", { on }),
    getStatus: () => invoke("get_status"),
    getStats: () => invoke("get_stats"),
    resetStats: () => invoke("reset_stats"),
    runBenchmark: () => invoke("run_benchmark"),
    listApps: () => invoke("list_apps"),
    relaunchAdmin: () => invoke("relaunch_admin"),
    openDataDir: () => invoke("open_data_dir"),
    previewHud: () => invoke("preview_hud"),
    onStatus: (cb) => sub("status", cb),
    onMonitor: (cb) => sub("monitor", cb),
    onRecorded: (cb) => sub("recorded", cb),
    onHud: (cb) => sub("hud", cb),
  };
}

let backend: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  // The SAMPLE mock exists only in `vite dev`; a release bundle never contains it.
  backend ??= inTauri
    ? tauriBackend()
    : import.meta.env.DEV
      ? import("./mock").then((m) => m.mockBackend())
      : Promise.reject(new Error("MacroForge must be opened as the desktop app."));
  return backend;
}
