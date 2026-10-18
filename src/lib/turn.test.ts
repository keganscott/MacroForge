import { describe, expect, it } from "vitest";

import { countsFor180, errorDegrees, fullCircleSteps, TURN_GAMES, turnSteps } from "./turn";

const game = (id: string) => TURN_GAMES.find((g) => g.id === id)!;

describe("perfect 180", () => {
  it("computes counts from the game's yaw and your sensitivity", () => {
    expect(countsFor180(game("cs2"), 2)).toBe(4091); // 180 / (0.022 × 2)
    expect(countsFor180(game("valorant"), 0.4)).toBe(6429); // 180 / (0.07 × 0.4)
    expect(countsFor180(game("overwatch"), 5)).toBe(5455); // 180 / (0.0066 × 5)
  });

  it("is off by at most half a count after rounding (one count = yaw × sensitivity degrees)", () => {
    for (const g of TURN_GAMES.filter((x) => x.yaw)) {
      for (const s of [0.3, 0.8, 1, 1.7, 3.33, 7]) {
        const c = countsFor180(g, s)!;
        expect(errorDegrees(g, s, c)).toBeLessThanOrEqual((g.yaw * s) / 2 + 1e-9);
      }
    }
    // Typical setups land within a few hundredths of a degree.
    expect(errorDegrees(TURN_GAMES[0]!, 2, countsFor180(TURN_GAMES[0]!, 2)!)).toBeLessThan(0.01);
  });

  it("asks for calibration when the game is unknown or sensitivity is not set", () => {
    expect(countsFor180(game("other"), 1)).toBeNull();
    expect(countsFor180(game("cs2"), 0)).toBeNull();
  });

  it("builds the move: direction, speed, and the full-circle test", () => {
    expect(turnSteps(4091, true, "snap")).toEqual([{ type: "move", dx: 4091, dy: 0, durationMs: 0 }]);
    expect(turnSteps(4091, false, "quick")).toEqual([{ type: "move", dx: -4091, dy: 0, durationMs: 60 }]);
    const circle = fullCircleSteps(100, true, "smooth");
    const total = circle.reduce((n, s) => n + (s.type === "move" ? s.dx : 0), 0);
    expect(total).toBe(200);
  });
});
