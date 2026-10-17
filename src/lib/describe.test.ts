import { describe, expect, it } from "vitest";

import { conflicts, macroDuration, parseShare, shareProfile, stepSummary } from "./describe";
import { comboName, keyName, MOD_CTRL, MOD_SHIFT, MOUSE_X1, vkFromDomCode } from "./keys";
import type { Data, Profile } from "./types";

const profile: Profile = {
  id: "p1",
  name: "CS",
  enabled: true,
  apps: ["cs2.exe"],
  bindings: [
    { id: "a", name: "", enabled: true, trigger: { input: 0x46, mods: 0, mode: "press", passthrough: false }, action: { type: "macro", macroId: "m1", repeat: 1, onRepress: "ignore", stopImmediately: true } },
    { id: "b", name: "", enabled: true, trigger: { input: 0x46, mods: 0, mode: "hold", passthrough: false }, action: { type: "block" } },
  ],
};

const data = { version: 1, profiles: [profile], macros: [{ id: "m1", name: "Combo", steps: [{ type: "delay", ms: 10, jitterMs: 0 }] }, { id: "m2", name: "Other", steps: [] }] } as unknown as Data;

describe("keys", () => {
  it("names keys, mouse buttons and combos", () => {
    expect(keyName(0x70)).toBe("F1");
    expect(keyName(0x41)).toBe("A");
    expect(keyName(MOUSE_X1)).toBe("Mouse 4");
    expect(comboName(0x43, MOD_CTRL | MOD_SHIFT)).toBe("Ctrl + Shift + C");
    expect(vkFromDomCode("KeyQ")).toBe(0x51);
    expect(vkFromDomCode("F12")).toBe(0x7b);
    expect(vkFromDomCode("ShiftRight")).toBe(0xa1);
  });
});

describe("share codes", () => {
  it("round-trip with fresh ids and only the macros the profile uses", () => {
    const code = shareProfile(data, profile);
    expect(code.startsWith("MF1-")).toBe(true);
    const pack = parseShare(code);
    expect(pack.macros).toHaveLength(1);
    expect(pack.macros[0]!.id).not.toBe("m1");
    expect(pack.profile.id).not.toBe("p1");
    const action = pack.profile.bindings[0]!.action;
    expect(action.type === "macro" && action.macroId).toBe(pack.macros[0]!.id);
  });

  it("rejects junk", () => {
    expect(() => parseShare("hello")).toThrow(/MF1-/);
    expect(() => parseShare("MF1-%%%")).toThrow(/damaged/);
    expect(() => parseShare("MF1-" + btoa('{"kind":"x"}'))).toThrow(/damaged/);
  });
});

describe("helpers", () => {
  it("finds trigger conflicts within a profile", () => {
    expect(conflicts(profile, profile.bindings[0]!).map((b) => b.id)).toEqual(["b"]);
  });

  it("estimates macro duration", () => {
    expect(
      macroDuration([
        { type: "press", input: 0x41, holdMs: 20 },
        { type: "delay", ms: 100, jitterMs: 5 },
        { type: "text", text: "abc", charDelayMs: 10 },
      ]),
    ).toBe(140);
  });

  it("summarises steps", () => {
    expect(stepSummary({ type: "wheel", delta: -3, horizontal: false })).toBe("3 notches down");
    expect(stepSummary({ type: "delay", ms: 1500, jitterMs: 0 })).toBe("Wait 1.50 s");
  });
});
