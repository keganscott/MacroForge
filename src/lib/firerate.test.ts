import { describe, expect, it } from "vitest";

import { dropShare, safeRate, simulate } from "./firerate";

describe("matching a gun's fire rate", () => {
  it("clicking at exactly the limit loses shots", () => {
    // 600 RPM gun (10/s) clicked at 10/s, 144 FPS.
    const share = dropShare(10, 600, 144);
    expect(share).toBeGreaterThan(0.1);
    const r = simulate(10, 600, 144);
    expect(r.shotsPerSec).toBeLessThan(9.5); // fewer shots than clicking slower
  });

  it("the safe rate never loses a shot, across frame rates and guns", () => {
    for (const fps of [30, 60, 90, 144, 240, 360]) {
      for (const rpm of [300, 450, 600, 800, 1200]) {
        const rate = safeRate(rpm, fps)!;
        expect(rate).toBeLessThan(rpm / 60);
        expect(dropShare(rate, rpm, fps), `${rpm} RPM at ${fps} FPS`).toBe(0);
      }
    }
  });

  it("the safe rate gets more shots out than clicking at the limit", () => {
    const atLimit = simulate(10, 600, 144).shotsPerSec;
    const safe = simulate(safeRate(600, 144)!, 600, 144).shotsPerSec;
    expect(safe).toBeGreaterThan(atLimit);
  });

  it("a press shorter than a frame can be missed entirely", () => {
    // 5 ms presses at 60 FPS (16.7 ms frames): most fall between frames.
    expect(dropShare(safeRate(600, 60)!, 600, 60, 5)).toBeGreaterThan(0.5);
    // Auto (half the gap) at the same rate loses none.
    expect(dropShare(safeRate(600, 60)!, 600, 60, 0)).toBe(0);
  });

  it("600 RPM at 144 FPS: about 9.3 per second", () => {
    expect(safeRate(600, 144)!).toBeCloseTo(9.29, 2);
    expect(safeRate(600, 60)!).toBeCloseTo(8.45, 2);
    expect(safeRate(0, 60)).toBeNull();
  });
});
