// Plain-language descriptions and small helpers shared by the views.

import { comboName, keyName } from "./keys";
import type { Action, Binding, Data, Macro, Profile, Step, TriggerMode } from "./types";

export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const MODE_TEXT: Record<TriggerMode, { label: string; hint: string }> = {
  press: { label: "Press", hint: "Runs once each time you press it." },
  hold: { label: "Hold", hint: "Runs while you hold it, stops when you let go." },
  toggle: { label: "Toggle", hint: "First press starts it, the next press stops it." },
};

export const ACTION_TEXT: Record<Action["type"], { label: string; hint: string }> = {
  macro: { label: "Play a macro", hint: "A sequence of keys, clicks, delays and text." },
  rapid: { label: "Rapid fire", hint: "Taps a key or clicks a button over and over." },
  remap: { label: "Remap", hint: "Sends a different key or button instead." },
  holdLock: { label: "Hold down", hint: "Holds a key down until you press again (auto-run)." },
  block: { label: "Disable", hint: "The key does nothing while this is on." },
};

export function actionSummary(a: Action, macros: Macro[]): string {
  switch (a.type) {
    case "macro": {
      const m = macros.find((x) => x.id === a.macroId);
      const name = m ? m.name : "Missing macro";
      return a.repeat > 1 ? `${name} × ${a.repeat}` : name;
    }
    case "rapid":
      return `${keyName(a.output)} at ${fmtRate(a.rate)}/s`;
    case "remap":
      return comboName(a.output, a.mods);
    case "holdLock":
      return `Hold ${keyName(a.output)}`;
    case "block":
      return "Nothing (disabled)";
  }
}

export function bindingTitle(b: Binding, macros: Macro[]): string {
  if (b.name) return b.name;
  if (b.action.type === "block") return `Disable ${keyName(b.trigger.input)}`;
  return `${ACTION_TEXT[b.action.type].label}: ${actionSummary(b.action, macros)}`;
}

export function fmtRate(r: number): string {
  return r >= 100 ? r.toFixed(0) : Number(r.toFixed(1)).toString();
}

export function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 2)} s`;
  return `${Math.round(ms * 10) / 10} ms`;
}

export function fmtUs(us: number): string {
  if (us >= 1000) return `${(us / 1000).toFixed(2)} ms`;
  return `${us.toFixed(us < 10 ? 1 : 0)} µs`;
}

export function stepSummary(s: Step): string {
  switch (s.type) {
    case "press":
      return `${keyName(s.input)}${s.holdMs ? ` · held ${fmtMs(s.holdMs)}` : ""}`;
    case "down":
      return `${keyName(s.input)} down`;
    case "up":
      return `${keyName(s.input)} up`;
    case "wheel":
      return `${Math.abs(s.delta)} notch${Math.abs(s.delta) === 1 ? "" : "es"} ${s.horizontal ? (s.delta > 0 ? "right" : "left") : s.delta > 0 ? "up" : "down"}`;
    case "move":
      return `Move ${s.dx}, ${s.dy}${s.durationMs ? ` over ${fmtMs(s.durationMs)}` : ""}`;
    case "moveTo":
      return `Cursor to ${s.x}, ${s.y}`;
    case "delay":
      return `Wait ${fmtMs(s.ms)}${s.jitterMs ? ` ± ${fmtMs(s.jitterMs)}` : ""}`;
    case "text":
      return `“${s.text.length > 40 ? s.text.slice(0, 40) + "…" : s.text}”`;
  }
}

/** Roughly how long one pass of a macro takes. */
export function macroDuration(steps: Step[]): number {
  let t = 0;
  for (const s of steps) {
    if (s.type === "press") t += s.holdMs;
    else if (s.type === "delay") t += s.ms;
    else if (s.type === "move") t += s.durationMs;
    else if (s.type === "text") t += Math.max(0, s.text.length - 1) * s.charDelayMs;
  }
  return t;
}

export function macroUsers(data: Data, macroId: string): { profile: Profile; binding: Binding }[] {
  const out: { profile: Profile; binding: Binding }[] = [];
  for (const p of data.profiles)
    for (const b of p.bindings) if (b.action.type === "macro" && b.action.macroId === macroId) out.push({ profile: p, binding: b });
  return out;
}

/** Other bindings in the same profile with the same trigger. */
export function conflicts(profile: Profile, b: Binding): Binding[] {
  if (!b.trigger.input) return [];
  return profile.bindings.filter(
    (o) => o.id !== b.id && o.enabled && o.trigger.input === b.trigger.input && o.trigger.mods === b.trigger.mods,
  );
}

// ------------------------------------------------------------ share codes --

const PREFIX = "MF1-";

export interface SharePack {
  kind: "profile";
  profile: Profile;
  macros: Macro[];
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function shareProfile(data: Data, profile: Profile): string {
  const ids = new Set(profile.bindings.flatMap((b) => (b.action.type === "macro" ? [b.action.macroId] : [])));
  const pack: SharePack = { kind: "profile", profile, macros: data.macros.filter((m) => ids.has(m.id)) };
  return PREFIX + b64url(JSON.stringify(pack));
}

/** Parse a share code. Fresh ids are given to everything so an import never
 * overwrites what is already there. Values are clamped again by the engine. */
export function parseShare(code: string): SharePack {
  const t = code.trim();
  if (!t.startsWith(PREFIX)) throw new Error("That is not a MacroForge share code (they start with MF1-).");
  if (t.length > 2_000_000) throw new Error("That share code is too long.");
  let pack: SharePack;
  try {
    pack = JSON.parse(unb64url(t.slice(PREFIX.length))) as SharePack;
  } catch {
    throw new Error("That share code is damaged or incomplete.");
  }
  if (pack?.kind !== "profile" || !pack.profile || !Array.isArray(pack.profile.bindings) || !Array.isArray(pack.macros))
    throw new Error("That share code is damaged or incomplete.");
  const macroIds = new Map<string, string>();
  const macros = pack.macros.map((m) => {
    const id = newId("m");
    macroIds.set(m.id, id);
    return { ...m, id, steps: Array.isArray(m.steps) ? m.steps : [] };
  });
  const profile: Profile = {
    ...pack.profile,
    id: newId("p"),
    name: String(pack.profile.name ?? "Imported").slice(0, 40),
    apps: Array.isArray(pack.profile.apps) ? pack.profile.apps.map(String) : [],
    bindings: pack.profile.bindings.map((b) => ({
      ...b,
      id: newId("b"),
      action: b.action?.type === "macro" ? { ...b.action, macroId: macroIds.get(b.action.macroId) ?? "" } : b.action,
    })),
  };
  return { kind: "profile", profile, macros };
}
