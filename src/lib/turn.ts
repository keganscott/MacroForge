// Perfect 180 and the sensitivity calculator. Games turn the camera by a
// fixed angle per mouse count ("yaw") times your sensitivity, so
//   counts for 180° = 180 / degrees per count
// MacroForge sends that many counts as relative mouse movement, which games
// read through raw input exactly (examples/raw_move_check.rs). Mouse DPI
// does not change the turn: MacroForge sends counts, not hand movement.
// DPI only matters for the cm/360 shown alongside.
//
// Where the values come from (checked 2026-10-17):
//   verified  - the same in every converter, and for CS2 the engine's own
//               m_yaw default (0.022): CS2/CS:GO, Apex, Source games,
//               Valorant 0.07, Overwatch 2 and Call of Duty 0.0066.
//   community - agreed by more than one converter but not by the developer:
//               Destiny 2 0.0066, Rainbow Six Siege 0.00572958, and
//               Minecraft Java's formula from its code.
//   measure   - no reliable published value (ARC Raiders, Fortnite, The
//               Finals, Marvel Rivals, Rust, PUBG): calibrate once with the
//               full-circle test and MacroForge saves the result.

import type { Step, TurnCalibration } from "./types";

export type TurnTier = "verified" | "community" | "measure";

export interface TurnGame {
  id: string;
  name: string;
  tier: TurnTier;
  /** Degrees per count at this sensitivity (null: not known, measure it). */
  degPerCount: (sens: number) => number | null;
  /** What the sensitivity field is called in this game. */
  sensLabel: string;
  sens: number;
  sensStep: number;
}

const linear = (yaw: number) => (sens: number) => (sens > 0 ? yaw * sens : null);

export const TURN_GAMES: TurnGame[] = [
  { id: "cs2", name: "Counter-Strike 2 / CS:GO", tier: "verified", degPerCount: linear(0.022), sensLabel: "Sensitivity", sens: 1.5, sensStep: 0.05 },
  { id: "valorant", name: "Valorant", tier: "verified", degPerCount: linear(0.07), sensLabel: "Sensitivity", sens: 0.4, sensStep: 0.01 },
  { id: "apex", name: "Apex Legends", tier: "verified", degPerCount: linear(0.022), sensLabel: "Mouse sensitivity", sens: 1.5, sensStep: 0.05 },
  { id: "overwatch", name: "Overwatch 2", tier: "verified", degPerCount: linear(0.0066), sensLabel: "Sensitivity", sens: 5, sensStep: 0.1 },
  { id: "cod", name: "Call of Duty (MW / Warzone)", tier: "verified", degPerCount: linear(0.0066), sensLabel: "Mouse sensitivity", sens: 5, sensStep: 0.1 },
  { id: "source", name: "Other Source games (TF2, Titanfall 2)", tier: "verified", degPerCount: linear(0.022), sensLabel: "Sensitivity", sens: 2, sensStep: 0.05 },
  { id: "destiny2", name: "Destiny 2", tier: "community", degPerCount: linear(0.0066), sensLabel: "Look sensitivity", sens: 8, sensStep: 1 },
  { id: "r6", name: "Rainbow Six Siege", tier: "community", degPerCount: linear(0.00572958), sensLabel: "Mouse sensitivity (horizontal)", sens: 10, sensStep: 1 },
  {
    id: "minecraft",
    name: "Minecraft (Java)",
    tier: "community",
    // The game's own code: f = slider × 0.6 + 0.2; turn = f³ × 8 × 0.15° per
    // count. The slider shows as a percentage, 100 % = 0.5.
    degPerCount: (pct) => {
      if (!(pct >= 0)) return null;
      const f = (pct / 200) * 0.6 + 0.2;
      return f * f * f * 8 * 0.15;
    },
    sensLabel: "Sensitivity % (as shown in game)",
    sens: 100,
    sensStep: 1,
  },
  { id: "arc-raiders", name: "ARC Raiders", tier: "measure", degPerCount: () => null, sensLabel: "Sensitivity", sens: 1, sensStep: 0.01 },
  { id: "fortnite", name: "Fortnite", tier: "measure", degPerCount: () => null, sensLabel: "Mouse sensitivity X", sens: 7, sensStep: 0.1 },
  { id: "the-finals", name: "The Finals", tier: "measure", degPerCount: () => null, sensLabel: "Sensitivity", sens: 1, sensStep: 0.01 },
  { id: "marvel-rivals", name: "Marvel Rivals", tier: "measure", degPerCount: () => null, sensLabel: "Sensitivity", sens: 5, sensStep: 0.1 },
  { id: "rust", name: "Rust", tier: "measure", degPerCount: () => null, sensLabel: "Look sensitivity", sens: 0.5, sensStep: 0.01 },
  { id: "pubg", name: "PUBG", tier: "measure", degPerCount: () => null, sensLabel: "General sensitivity", sens: 50, sensStep: 1 },
  { id: "other", name: "Any other game", tier: "measure", degPerCount: () => null, sensLabel: "Sensitivity", sens: 1, sensStep: 0.01 },
];

export const TIER_TEXT: Record<TurnTier, { label: string; hint: string }> = {
  verified: { label: "Verified value", hint: "The same in every sensitivity converter (for CS2, the game's own default)." },
  community: { label: "Community value", hint: "Agreed by converters but not published by the developer. Confirm with the full-circle test." },
  measure: { label: "Measure once", hint: "No reliable published value. Find it with the full-circle test; MacroForge saves it for this game." },
};

export type TurnSpeed = "snap" | "quick" | "smooth";

export const TURN_SPEEDS: { id: TurnSpeed; label: string; ms: number; hint: string }[] = [
  { id: "snap", label: "Snap", ms: 0, hint: "Instant, in one movement, like Razer's Perfect 180." },
  { id: "quick", label: "Quick", ms: 60, hint: "A fast sweep over 60 ms. Looks like a flick." },
  { id: "smooth", label: "Smooth", ms: 150, hint: "A visible 150 ms turn, for games that limit how fast the camera can move." },
];

export const MAX_TURN_COUNTS = 200_000;

/**
 * Degrees per count for a game at a sensitivity: the saved calibration if
 * there is one (it is a measurement of this PC and game), else the game's
 * value. Calibrations are stored per sensitivity 1 and scale linearly, which
 * is exact for linear games; Minecraft is never stored this way.
 */
export function degPerCount(game: TurnGame, sens: number, saved?: TurnCalibration[]): number | null {
  const cal = saved?.find((c) => c.game === game.id);
  if (cal && game.id !== "minecraft") return sens > 0 ? cal.yaw * sens : null;
  return game.degPerCount(sens);
}

export function countsFor(degrees: number, perCount: number | null): number | null {
  if (!perCount || !(perCount > 0)) return null;
  return Math.min(MAX_TURN_COUNTS, Math.max(1, Math.round(degrees / perCount)));
}

/** The old single-call form, kept for callers and tests. */
export function countsFor180(game: TurnGame, sens: number, saved?: TurnCalibration[]): number | null {
  return countsFor(180, degPerCount(game, sens, saved));
}

/** How far a whole number of counts is from an exact 180°, in degrees. */
export function errorDegrees(perCount: number | null, counts: number): number {
  return perCount ? Math.abs(counts * perCount - 180) : 0;
}

/** eDPI is DPI × sensitivity, so sensitivity = eDPI ÷ DPI. */
export function sensFromEdpi(edpi: number, dpi: number): number | null {
  return edpi > 0 && dpi > 0 ? edpi / dpi : null;
}

/** Centimetres of real mouse movement for a full 360°, at a DPI. */
export function cmPer360(perCount: number | null, dpi: number): number | null {
  if (!perCount || !(dpi > 0)) return null;
  return (360 / perCount / dpi) * 2.54;
}

/** From a turn you confirmed in game: degrees per count at sensitivity 1. */
export function yawFromCalibration(countsFor180: number, sens: number): number | null {
  return countsFor180 > 0 && sens > 0 ? 180 / countsFor180 / sens : null;
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
