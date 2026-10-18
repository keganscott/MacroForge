// Perfect 180: one button turns you around. Games turn the camera by a
// fixed angle per mouse count ("yaw") times your sensitivity, so
//   counts for 180° = 180 / (yaw × sensitivity)
// MacroForge sends that many counts as relative mouse movement, which games
// read through raw input exactly (examples/raw_move_check.rs). Mouse DPI
// does not matter: counts are counts.
//
// Yaw values (degrees per count at sensitivity 1) are the ones the
// community sensitivity converters use (e.g. csdb.gg), not official
// developer figures; "Other game" calibrates by testing instead.

import type { Step } from "./types";

export interface TurnGame {
  id: string;
  name: string;
  /** Degrees per count at sensitivity 1; 0 = calibrate by testing. */
  yaw: number;
  /** A typical sensitivity to start from. */
  sens: number;
}

export const TURN_GAMES: TurnGame[] = [
  { id: "cs2", name: "Counter-Strike 2", yaw: 0.022, sens: 1.5 },
  { id: "apex", name: "Apex Legends", yaw: 0.022, sens: 1.5 },
  { id: "valorant", name: "Valorant", yaw: 0.07, sens: 0.4 },
  { id: "overwatch", name: "Overwatch 2", yaw: 0.0066, sens: 5 },
  { id: "cod", name: "Call of Duty", yaw: 0.0066, sens: 5 },
  { id: "other", name: "Other game (find it by testing)", yaw: 0, sens: 1 },
];

export type TurnSpeed = "snap" | "quick" | "smooth";

export const TURN_SPEEDS: { id: TurnSpeed; label: string; ms: number; hint: string }[] = [
  { id: "snap", label: "Snap", ms: 0, hint: "Instant, in one movement, like Razer's Perfect 180." },
  { id: "quick", label: "Quick", ms: 60, hint: "A fast sweep over 60 ms. Looks like a flick." },
  { id: "smooth", label: "Smooth", ms: 150, hint: "A visible 150 ms turn, for games that limit how fast the camera can move." },
];

export const MAX_TURN_COUNTS = 200_000;

/** Counts for a 180° turn, or null when the game must be calibrated by testing. */
export function countsFor180(game: TurnGame, sensitivity: number): number | null {
  if (!game.yaw || !(sensitivity > 0)) return null;
  return Math.min(MAX_TURN_COUNTS, Math.max(1, Math.round(180 / (game.yaw * sensitivity))));
}

/** How far off a count is from a true 180°, in degrees (rounding error). */
export function errorDegrees(game: TurnGame, sensitivity: number, counts: number): number {
  return game.yaw ? Math.abs(counts * game.yaw * sensitivity - 180) : 0;
}

/** The macro steps for one turn. `right` turns clockwise. */
export function turnSteps(counts: number, right: boolean, speed: TurnSpeed): Step[] {
  const ms = TURN_SPEEDS.find((s) => s.id === speed)!.ms;
  return [{ type: "move", dx: right ? counts : -counts, dy: 0, durationMs: ms }];
}

/** Two turns with a pause between: you should face exactly where you began. */
export function fullCircleSteps(counts: number, right: boolean, speed: TurnSpeed): Step[] {
  return [...turnSteps(counts, right, speed), { type: "delay", ms: 450, jitterMs: 0 }, ...turnSteps(counts, right, speed)];
}
