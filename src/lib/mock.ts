// SAMPLE backend for the browser preview (npm run dev). Nothing here touches
// real input; every screen shows a SAMPLE label while it is in use.

import type { Backend } from "./ipc";
import { vkFromDomCode, MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT, MOUSE_X1, MOUSE_X2, MOD_CTRL, MOD_SHIFT, MOD_ALT } from "./keys";
import type { Data, Hud, MonitorEvent, Status, Step } from "./types";

const defaults = (): Data => ({
  version: 1,
  profiles: [
    {
      id: "global",
      name: "Everywhere",
      enabled: true,
      apps: [],
      bindings: [
        {
          id: "b-click",
          name: "Auto-clicker",
          enabled: true,
          trigger: { input: 0x76, mods: 0, mode: "toggle", passthrough: false },
          action: { type: "rapid", output: MOUSE_LEFT, rate: 15, holdMs: 15, jitterPct: 8 },
        },
        {
          id: "b-win",
          name: "",
          enabled: true,
          trigger: { input: 0x5b, mods: 0, mode: "press", passthrough: false },
          action: { type: "block" },
        },
      ],
    },
    {
      id: "p-arc",
      name: "ARC Raiders",
      enabled: true,
      apps: ["pioneergame.exe"],
      bindings: [
        {
          id: "b-run",
          name: "Auto-run",
          enabled: true,
          trigger: { input: MOUSE_X2, mods: 0, mode: "press", passthrough: false },
          action: { type: "holdLock", output: 0x57 },
        },
        {
          id: "b-loot",
          name: "Quick loot",
          enabled: true,
          trigger: { input: 0x46, mods: 0, mode: "hold", passthrough: false },
          action: { type: "rapid", output: 0x46, rate: 12, holdMs: 20, jitterPct: 0 },
        },
        {
          id: "b-heal",
          name: "",
          enabled: true,
          trigger: { input: MOUSE_X1, mods: 0, mode: "press", passthrough: false },
          action: { type: "macro", macroId: "m-heal", repeat: 1, onRepress: "ignore", stopImmediately: true },
        },
      ],
    },
  ],
  macros: [
    {
      id: "m-heal",
      name: "Heal + reload",
      steps: [
        { type: "press", input: 0x34, holdMs: 20 },
        { type: "delay", ms: 120, jitterMs: 10 },
        { type: "press", input: MOUSE_LEFT, holdMs: 900 },
        { type: "delay", ms: 80, jitterMs: 0 },
        { type: "press", input: 0x31, holdMs: 20 },
        { type: "delay", ms: 60, jitterMs: 0 },
        { type: "press", input: 0x52, holdMs: 20 },
      ],
    },
    {
      id: "m-gg",
      name: "Type GG",
      steps: [
        { type: "press", input: 0x0d, holdMs: 15 },
        { type: "delay", ms: 40, jitterMs: 0 },
        { type: "text", text: "gg wp", charDelayMs: 8 },
        { type: "press", input: 0x0d, holdMs: 15 },
      ],
    },
  ],
  settings: {
    masterHotkey: { input: 0x91, mods: 0 },
    panicHotkey: { input: 0x13, mods: 0 },
    timing: "precise",
    armedOnLaunch: true,
    ignoreForeignInjected: true,
    hud: true,
    hudPosition: "topCenter",
    sounds: true,
    closeToTray: true,
    startMinimized: false,
    startWithWindows: false,
    accent: "violet",
    recordTiming: "real",
    recordFixedDelayMs: 30,
    recordMouseMoves: false,
    seenWelcome: true,
  },
});

export function mockBackend(): Backend {
  let data = defaults();
  const statusSubs = new Set<(s: Status) => void>();
  const monitorSubs = new Set<(e: MonitorEvent[]) => void>();
  const recSubs = new Set<(n: number) => void>();
  const hudSubs = new Set<(h: Hud) => void>();
  let recording: Step[] | null = null;
  let monitorOn = false;
  const t0 = performance.now();

  let status: Status = {
    armed: true,
    foreground: "pioneergame.exe",
    foregroundElevated: false,
    selfElevated: false,
    pausedOwnWindow: false,
    activeProfiles: ["global", "p-arc"],
    liveBindings: 5,
    running: [],
    locks: [],
    hook: { keyboard: true, mouse: true },
    recording: false,
    monitoring: false,
  };
  const emit = () => statusSubs.forEach((cb) => cb({ ...status }));
  const set = (p: Partial<Status>) => {
    status = { ...status, ...p };
    emit();
  };

  // Simulated live input for the monitor and recorder.
  const onKey = (e: KeyboardEvent) => {
    const vk = vkFromDomCode(e.code);
    if (!vk || e.repeat) return;
    const down = e.type === "keydown";
    if (monitorOn) monitorSubs.forEach((cb) => cb([{ input: vk, down, injected: false, t: performance.now() - t0 }]));
    if (recording && down) {
      recording.push({ type: "press", input: vk, holdMs: 20 }, { type: "delay", ms: 90, jitterMs: 0 });
      recSubs.forEach((cb) => cb(recording!.length));
    }
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    sample: true,
    async getSnapshot() {
      return { data: structuredClone(data), status, warning: null, dataDir: "%APPDATA%\\MacroForge (SAMPLE)", version: "0.1.0", autostart: false };
    },
    async saveData(d) {
      data = structuredClone(d);
      return structuredClone(data);
    },
    async setArmed(armed) {
      const next = armed ?? !status.armed;
      set({ armed: next, running: next ? status.running : [], locks: next ? status.locks : [] });
      hudSubs.forEach((cb) => cb({ text: next ? "MacroForge on" : "MacroForge off", on: next }));
    },
    async panicStop() {
      set({ running: [], locks: [] });
    },
    captureInput(timeoutMs) {
      return new Promise((resolve) => {
        const done = (v: { input: number; mods: number } | null) => {
          window.removeEventListener("keydown", kd, true);
          window.removeEventListener("mousedown", md, true);
          clearTimeout(timer);
          resolve(v);
        };
        const kd = (e: KeyboardEvent) => {
          if (e.code === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            return done({ input: 0, mods: 0 });
          }
          const vk = vkFromDomCode(e.code);
          if (!vk || ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight"].includes(e.code)) return;
          e.preventDefault();
          e.stopPropagation();
          done({ input: vk, mods: (e.ctrlKey ? MOD_CTRL : 0) | (e.shiftKey ? MOD_SHIFT : 0) | (e.altKey ? MOD_ALT : 0) });
        };
        const md = (e: MouseEvent) => {
          // Left / right click work the UI, as in the real engine.
          if (e.button === 0 || e.button === 2) return;
          const map = [MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT, MOUSE_X1, MOUSE_X2];
          e.preventDefault();
          done({ input: map[e.button] ?? MOUSE_X1, mods: 0 });
        };
        window.addEventListener("keydown", kd, true);
        setTimeout(() => window.addEventListener("mousedown", md, true), 50);
        const timer = setTimeout(() => done(null), timeoutMs);
        cancelCurrent = () => done(null);
      });
    },
    async cancelCapture() {
      cancelCurrent?.();
    },
    async recordStart() {
      recording = [];
      set({ recording: true });
    },
    async recordStop() {
      const r = recording ?? [];
      recording = null;
      set({ recording: false });
      if (r.length && r[r.length - 1]?.type === "delay") r.pop();
      return r;
    },
    async playSteps(id, label) {
      set({ running: [...status.running, { id: `play:${id}`, label, mode: "press", startedMs: performance.now() }] });
      await wait(1200);
      set({ running: status.running.filter((r) => r.id !== `play:${id}`) });
    },
    async stopRun(id) {
      set({ running: status.running.filter((r) => r.id !== id && r.id !== `play:${id}`) });
    },
    async setMonitor(on) {
      monitorOn = on;
      set({ monitoring: on });
    },
    async getStatus() {
      return status;
    },
    async getStats() {
      return { hookEvents: 4821, hookAvgUs: 1.9, hookMaxUs: 41.2, latencySamples: 212, latencyP50Us: 84, latencyP99Us: 310, latencyMaxUs: 702, sendFailures: 0 };
    },
    async resetStats() {},
    async runBenchmark() {
      await wait(1500);
      return [
        { label: "Precise", targetMs: 1, samples: 80, meanLateUs: 3.1, p99LateUs: 9.8, maxLateUs: 21.4 },
        { label: "Precise", targetMs: 5, samples: 60, meanLateUs: 2.7, p99LateUs: 8.1, maxLateUs: 14.0 },
        { label: "Precise", targetMs: 16.7, samples: 30, meanLateUs: 2.9, p99LateUs: 7.7, maxLateUs: 7.7 },
        { label: "Efficient", targetMs: 1, samples: 80, meanLateUs: 412, p99LateUs: 980, maxLateUs: 1203 },
        { label: "Efficient", targetMs: 5, samples: 60, meanLateUs: 398, p99LateUs: 940, maxLateUs: 1010 },
        { label: "Efficient", targetMs: 16.7, samples: 30, meanLateUs: 420, p99LateUs: 870, maxLateUs: 870 },
      ];
    },
    async listApps() {
      return [
        { exe: "cs2.exe", title: "Counter-Strike 2" },
        { exe: "discord.exe", title: "Discord" },
        { exe: "pioneergame.exe", title: "ARC Raiders" },
        { exe: "valorant-win64-shipping.exe", title: "VALORANT" },
      ];
    },
    async relaunchAdmin() {
      return false;
    },
    async openDataDir() {},
    async previewHud() {
      hudSubs.forEach((cb) => cb({ text: "Auto-clicker on", on: true }));
    },
    onStatus: (cb) => (statusSubs.add(cb), () => statusSubs.delete(cb)),
    onMonitor: (cb) => (monitorSubs.add(cb), () => monitorSubs.delete(cb)),
    onRecorded: (cb) => (recSubs.add(cb), () => recSubs.delete(cb)),
    onHud: (cb) => (hudSubs.add(cb), () => hudSubs.delete(cb)),
  };
}

let cancelCurrent: (() => void) | null = null;
