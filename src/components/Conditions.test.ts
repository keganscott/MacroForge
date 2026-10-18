import { describe, expect, it } from "vitest";

import { conditionBadges, defaultAimKey } from "./Conditions";
import { MOUSE_LEFT, MOUSE_RIGHT, MOUSE_X1 } from "../lib/keys";

describe("conditions", () => {
  it("defaults the aim button to right click, unless that is the trigger", () => {
    expect(defaultAimKey(MOUSE_LEFT)).toBe(MOUSE_RIGHT);
    expect(defaultAimKey(MOUSE_RIGHT)).toBe(MOUSE_X1);
  });

  it("labels bindings plainly", () => {
    expect(conditionBadges(undefined)).toEqual([]);
    expect(conditionBadges({ whileHeld: MOUSE_RIGHT, pauseInMenus: true })).toEqual(["While aiming", "Not in menus"]);
    expect(conditionBadges({ whileHeld: MOUSE_X1, pauseInMenus: false })).toEqual(["While holding Mouse 4"]);
  });
});
