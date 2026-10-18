import { describe, expect, it } from "vitest";

import { GAME_PRESETS, sendsInput } from "./presets";

const valid = (c: number) => c > 0 && c < 265;

describe("game presets", () => {
  it("items are well formed and no two in a game share a key", () => {
    for (const g of GAME_PRESETS) {
      const seen = new Set<string>();
      for (const i of g.items) {
        expect(valid(i.trigger.input), `${g.id}/${i.key}`).toBe(true);
        const k = `${i.trigger.input}:${i.trigger.mods ?? 0}`;
        expect(seen.has(k), `${g.id}/${i.key} duplicates a trigger`).toBe(false);
        seen.add(k);
        if (i.action.type === "macro") {
          expect(i.macro, `${g.id}/${i.key} needs its macro`).toBeDefined();
          expect(i.macro!.steps.length).toBeGreaterThan(0);
        }
        if ("output" in i.action) expect(valid(i.action.output), `${g.id}/${i.key}`).toBe(true);
        if (i.action.type === "rapid") expect(i.action.rate).toBeGreaterThan(0);
        if (i.tier === "safe") expect(sendsInput(i.action), `${g.id}/${i.key} is marked safe`).toBe(false);
      }
    }
  });

  it("Stardew's cancel macro releases everything it presses", () => {
    const g = GAME_PRESETS.find((x) => x.id === "stardew")!;
    for (const i of g.items.filter((x) => x.macro)) {
      const held = new Set<number>();
      for (const s of i.macro!.steps) {
        if (s.type === "down") held.add(s.input);
        if (s.type === "up") held.delete(s.input);
      }
      expect(held.size, i.key).toBe(0);
    }
  });

});
