// App state: the user's data (edited optimistically, saved debounced) and
// the engine's live status. A tiny external store; components subscribe to
// slices with useStore(selector).

import { useSyncExternalStore } from "react";

import { getBackend, type Backend } from "./lib/ipc";
import type { Data, Status } from "./lib/types";

export interface State {
  ready: boolean;
  sample: boolean;
  data: Data | null;
  status: Status | null;
  dataDir: string;
  version: string;
  saving: boolean;
  saveError: string | null;
  loadWarning: string | null;
  toast: { id: number; text: string; undo?: () => void } | null;
  /** Newest first: toggles, on/off, Stop all, profile switches. */
  activity: Activity[];
}

export interface Activity {
  id: number;
  text: string;
  on: boolean;
  at: number;
}

let state: State = {
  ready: false,
  sample: false,
  data: null,
  status: null,
  dataDir: "",
  version: "",
  saving: false,
  saveError: null,
  loadWarning: null,
  toast: null,
  activity: [],
};

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function set(p: Partial<State>) {
  state = { ...state, ...p };
  emit();
}

export function getState(): State {
  return state;
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => sel(state),
  );
}

let be: Backend | null = null;
export const backend = (): Backend => {
  if (!be) throw new Error("backend not ready");
  return be;
};

export async function boot() {
  be = await getBackend();
  const snap = await be.getSnapshot();
  set({
    ready: true,
    sample: be.sample,
    data: snap.data,
    status: snap.status,
    dataDir: snap.dataDir,
    version: snap.version,
    loadWarning: snap.warning,
  });
  be.onStatus((status) => {
    // A game profile coming into or out of effect is worth a line too.
    const before = new Set(state.status?.activeProfiles ?? []);
    const after = new Set(status.activeProfiles);
    for (const p of state.data?.profiles ?? []) {
      // Alt-tabbing into MacroForge itself pauses everything; that is not news.
      if (!state.status || status.pausedOwnWindow || state.status.pausedOwnWindow) break;
      if (!p.apps.length || before.has(p.id) === after.has(p.id)) continue;
      log(`${p.name} profile ${after.has(p.id) ? "active" : "inactive"}`, after.has(p.id));
    }
    set({ status });
  });
  be.onActivity((h) => log(h.text, h.on));
}

let activitySeq = 0;
function log(text: string, on: boolean) {
  set({ activity: [{ id: ++activitySeq, text, on, at: Date.now() }, ...state.activity].slice(0, 30) });
}

// ----------------------------------------------------------------- saving --

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let editSeq = 0;

/** Change the data. The UI updates now; the save follows 250 ms after the
 * last edit, and the engine's clamped copy replaces ours if nothing changed
 * in between. */
export function update(fn: (d: Data) => Data) {
  if (!state.data) return;
  const next = fn(state.data);
  if (next === state.data) return;
  set({ data: next });
  const seq = ++editSeq;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(seq), 250);
}

/** Save any pending edit right away. */
export async function flushNow() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await flush(editSeq);
}

async function flush(seq: number) {
  saveTimer = null;
  const d = state.data;
  if (!d || !be) return;
  set({ saving: true });
  try {
    const saved = await be.saveData(d);
    if (seq === editSeq) set({ data: saved, saving: false, saveError: null });
    else set({ saving: false });
  } catch (e) {
    set({ saving: false, saveError: String(e) });
  }
}

let toastSeq = 0;
export function toast(text: string, undo?: () => void) {
  const id = ++toastSeq;
  set({ toast: { id, text, undo } });
  setTimeout(() => {
    if (state.toast?.id === id) set({ toast: null });
  }, undo ? 6000 : 3200);
}

export function dismissToast() {
  set({ toast: null });
}

export function dismissWarning() {
  set({ loadWarning: null });
}

// ------------------------------------------------------------ data helpers --

export function mutateProfile(profileId: string, fn: (p: Data["profiles"][number]) => Data["profiles"][number]) {
  update((d) => ({ ...d, profiles: d.profiles.map((p) => (p.id === profileId ? fn(p) : p)) }));
}

export function setSettings(p: Partial<Data["settings"]>) {
  update((d) => ({ ...d, settings: { ...d.settings, ...p } }));
}
