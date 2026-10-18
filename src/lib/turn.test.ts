import { describe, expect, it } from "vitest";

import {
  cmPer360,
  countsFor180,
  degPerCount,
  errorDegrees,
  fullCircleSteps,
  sensFromEdpi,
  TURN_GAMES,
  turnSteps,
  yawFromCalibration,
} from "./turn";

const game = (id: string) => TURN_GAMES.find((g) => g.id === id)!;

describe("perfect 180 calculator", () => {
  it("computes counts from the game's value and your sensitivity", () => {
    expect(countsFor180(game("cs2"), 2)).toBe(4091); // 180 / (0.022 × 2)
    expect(countsFor180(game("valorant"), 0.4)).toBe(6429); // 180 / (0.07 × 0.4)
    expect(countsFor180(game("overwatch"), 5)).toBe(5455); // 180 / (0.0066 × 5)
    expect(countsFor180(game("apex"), 1.5)).toBe(5455);
  });

  it("follows Minecraft's cubic sensitivity", () => {
    // 100 % = slider 0.5: f = 0.5; 0.125 × 8 × 0.15 = 0.15° per count.
    expect(degPerCount(game("minecraft"), 100)).toBeCloseTo(0.15, 10);
    expect(countsFor180(game("minecraft"), 100)).toBe(1200);
    // Doubling the slider does not double the turn (cubic).
    const a = degPerCount(game("minecraft"), 50)!;
    const b = degPerCount(game("minecraft"), 100)!;
    expect(b / a).not.toBeCloseTo(2, 1);
  });

  it("games without a reliable value must be measured, then use the measurement", () => {
    expect(countsFor180(game("arc-raiders"), 1)).toBeNull();
    const yaw = yawFromCalibration(5000, 1.2)!; // you confirmed 5000 counts at sens 1.2
    const saved = [{ game: "arc-raiders", yaw }];
    expect(countsFor180(game("arc-raiders"), 1.2, saved)).toBe(5000);
    // Change sensitivity later: it still knows.
    expect(countsFor180(game("arc-raiders"), 2.4, saved)).toBe(2500);
  });

  it("a calibration also overrides a published value (it is a measurement)", () => {
    const saved = [{ game: "cs2", yaw: yawFromCalibration(4100, 2)! }];
    expect(countsFor180(game("cs2"), 2, saved)).toBe(4100);
  });

  it("is off by at most half a count after rounding", () => {
    for (const g of TURN_GAMES.filter((x) => x.tier !== "measure")) {
      for (const s of [0.3, 0.8, 1, 1.7, 3.33, 7, 50, 100]) {
        const per = degPerCount(g, s);
        const c = countsFor180(g, s);
        if (!per || !c || c >= 200_000) continue;
        expect(errorDegrees(per, c)).toBeLessThanOrEqual(per / 2 + 1e-9);
      }
    }
  });

  it("eDPI and cm/360", () => {
    expect(sensFromEdpi(1600, 800)).toBe(2);
    expect(sensFromEdpi(0, 800)).toBeNull();
    // CS2, sens 2 at 800 DPI: 8182 counts per 360 / 800 × 2.54 ≈ 25.98 cm.
    expect(cmPer360(degPerCount(game("cs2"), 2), 800)).toBeCloseTo(25.977, 2);
  });

  it("builds the move: direction, speed, and the full-circle test", () => {
    expect(turnSteps(4091, true, "snap")).toEqual([{ type: "move", dx: 4091, dy: 0, durationMs: 0 }]);
    expect(turnSteps(4091, false, "quick")).toEqual([{ type: "move", dx: -4091, dy: 0, durationMs: 60 }]);
    const total = fullCircleSteps(100, true, "smooth").reduce((n, s) => n + (s.type === "move" ? s.dx : 0), 0);
    expect(total).toBe(200);
  });
});
