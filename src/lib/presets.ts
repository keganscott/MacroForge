// Game presets: what to set in the game itself, then ready-made bindings.
// Keybinds are each game's PC defaults as published; if you changed yours
// in-game, change the binding's output to match.

import { MOUSE_LEFT, MOUSE_RIGHT, MOUSE_X1, MOUSE_X2 } from "./keys";
import type { Action, Macro, TriggerMode } from "./types";

export interface PresetItem {
  key: string;
  title: string;
  why: string;
  tier: "safe" | "input";
  /** Ticked when the preset opens. */
  defaultOn: boolean;
  trigger: { input: number; mods?: number; mode?: TriggerMode };
  action: Action;
  /** A macro this item plays (its id is replaced on install). */
  macro?: Macro;
}

export interface GamePreset {
  id: string;
  name: string;
  tagline: string;
  apps: string[];
  /** Settings in the game itself that do the job better than a macro. */
  gameSettings: string[];
  items: PresetItem[];
  keybindSource?: { label: string; url: string };
}

const blockWin: PresetItem[] = [
  {
    key: "lwin",
    title: "Disable Left Windows key",
    why: "Stops a stray Windows key throwing you to the desktop mid-fight.",
    tier: "safe",
    defaultOn: true,
    trigger: { input: 0x5b },
    action: { type: "block" },
  },
  {
    key: "rwin",
    title: "Disable Right Windows key",
    why: "Same, for the right-hand key.",
    tier: "safe",
    defaultOn: true,
    trigger: { input: 0x5c },
    action: { type: "block" },
  },
];

export const GAME_PRESETS: GamePreset[] = [
  {
    id: "arc-raiders",
    name: "ARC Raiders",
    tagline: "Extraction shooter by Embark Studios",
    apps: ["pioneergame.exe"],
    gameSettings: [
      "Settings › Controls: bind “Aim (Toggle)”. It is unassigned by default, and is the built-in way to aim without holding right-click.",
      "Settings › Controls: bind “Sprint (Toggle)”, also unassigned by default, for long topside runs without holding Left Shift.",
      "Crouch already has both: hold Left Ctrl, or toggle with C. Walk toggles with V.",
      "Ping defaults to Middle Mouse; you can move it to a side button in Settings › Controls.",
      "Settings › Audio: proximity chat defaults to push-to-talk on B, party chat to open mic.",
    ],
    items: [
      ...blockWin,
      {
        key: "autorun",
        title: "Auto-run on Mouse 5",
        why: "Press Mouse 5 to keep W held for long topside runs; press again (or Stop all) to let go. ARC Raiders has no auto-run of its own.",
        tier: "input",
        defaultOn: false,
        trigger: { input: MOUSE_X2 },
        action: { type: "holdLock", output: 0x57 },
      },
    ],
    keybindSource: { label: "arcraiders.wiki: Settings", url: "https://arcraiders.wiki/wiki/Settings" },
  },
  {
    id: "fortnite",
    name: "Fortnite",
    tagline: "Battle royale by Epic Games",
    apps: ["fortniteclient-win64-shipping.exe"],
    gameSettings: [
      "Settings › Input: rebind anything you like there, including build pieces on mouse side buttons.",
      "Settings › Game: “Edit Hold Time” and “Edit on Release” make editing feel faster without any macro.",
      "Settings › Game: “Toggle Targeting” lets you aim without holding right-click.",
    ],
    items: [...blockWin],
  },
  {
    id: "minecraft",
    name: "Minecraft",
    tagline: "Java and Bedrock, single-player and your own worlds",
    apps: ["javaw.exe", "minecraft.windows.exe"],
    gameSettings: [
      "Java: press F3 + P so the game keeps running when you alt-tab. Otherwise AFK farms pause the moment it loses focus.",
      "Java: Options › Controls lets you set Sprint to Toggle instead of holding Ctrl.",
      "Java 1.9+: a sword’s full-damage swing is about 1.6 per second, which is what the mob-farm clicker below is timed to.",
    ],
    items: [
      ...blockWin,
      {
        key: "mobfarm",
        title: "Mob farm attacker on F6",
        why: "Toggles left-click at 1.6 per second, the full-strength sword rhythm in Java 1.9+, so every hit lands at full damage instead of weak spam-clicks. Stops when you alt-tab away.",
        tier: "input",
        defaultOn: true,
        trigger: { input: 0x75, mode: "toggle" },
        action: { type: "rapid", output: MOUSE_LEFT, rate: 1.6, holdMs: 30, jitterPct: 0 },
      },
      {
        key: "fishing",
        title: "AFK fishing on F7",
        why: "Holds right-click down for AFK fish farms that need it held. Press F7 again to let go.",
        tier: "input",
        defaultOn: true,
        trigger: { input: 0x76 },
        action: { type: "holdLock", output: MOUSE_RIGHT },
      },
      {
        key: "mine",
        title: "Hold to mine on F8",
        why: "Keeps left-click held for cobblestone generators and tree farms. Press F8 again to stop.",
        tier: "input",
        defaultOn: true,
        trigger: { input: 0x77 },
        action: { type: "holdLock", output: MOUSE_LEFT },
      },
      {
        key: "walk",
        title: "Auto-walk on Mouse 5",
        why: "Keeps W held for long journeys (Java has no auto-walk). Press Mouse 5 again to stop.",
        tier: "input",
        defaultOn: true,
        trigger: { input: MOUSE_X2 },
        action: { type: "holdLock", output: 0x57 },
      },
      {
        key: "place",
        title: "Fast place while holding Mouse 4",
        why: "Right-clicks 5 times a second while held: the game’s own top speed for placing blocks (one every 4 ticks), so none are wasted.",
        tier: "input",
        defaultOn: false,
        trigger: { input: MOUSE_X1, mode: "hold" },
        action: { type: "rapid", output: MOUSE_RIGHT, rate: 5, holdMs: 0, jitterPct: 0 },
      },
    ],
  },
  {
    id: "stardew",
    name: "Stardew Valley",
    tagline: "Farming, mining and fishing, solo or co-op",
    apps: ["stardew valley.exe", "stardewmoddingapi.exe"],
    gameSettings: [
      "Keep the game’s default keys for this: the cancel uses Right Shift, R and Delete, and the tool uses left-click.",
      "The timings assume 60 FPS. If your game runs faster or slower, nudge the wait in Macros (the 83 ms step).",
      "Space is not used by the game’s default keys, which is why it is the trigger.",
    ],
    items: [
      {
        key: "cancel",
        title: "Fast tools: hold Space",
        why: "While Space is held: swing (left-click, 1 frame), wait 5 frames (83 ms) for the hit to land, then Right Shift + R + Delete for 1 frame to cut the follow-through. Repeats every ~7 frames. Timing from the community’s tested script.",
        tier: "input",
        defaultOn: true,
        trigger: { input: 0x20, mode: "hold" },
        action: { type: "macro", macroId: "", repeat: 1, onRepress: "ignore", stopImmediately: false },
        macro: {
          id: "",
          name: "Stardew: fast tools (animation cancel)",
          steps: [
            { type: "press", input: MOUSE_LEFT, holdMs: 17 },
            { type: "delay", ms: 83, jitterMs: 0 },
            { type: "down", input: 0xa1 },
            { type: "down", input: 0x52 },
            { type: "down", input: 0x2e },
            { type: "delay", ms: 17, jitterMs: 0 },
            { type: "up", input: 0x2e },
            { type: "up", input: 0x52 },
            { type: "up", input: 0xa1 },
            { type: "delay", ms: 17, jitterMs: 0 },
          ],
        },
      },
      {
        key: "water",
        title: "Fast watering can: hold Mouse 4",
        why: "The same rhythm with a 9-frame wait (150 ms), which upgraded watering cans need before the cancel, per the same thread.",
        tier: "input",
        defaultOn: true,
        trigger: { input: MOUSE_X1, mode: "hold" },
        action: { type: "macro", macroId: "", repeat: 1, onRepress: "ignore", stopImmediately: false },
        macro: {
          id: "",
          name: "Stardew: fast watering can",
          steps: [
            { type: "press", input: MOUSE_LEFT, holdMs: 17 },
            { type: "delay", ms: 150, jitterMs: 0 },
            { type: "down", input: 0xa1 },
            { type: "down", input: 0x52 },
            { type: "down", input: 0x2e },
            { type: "delay", ms: 17, jitterMs: 0 },
            { type: "up", input: 0x2e },
            { type: "up", input: 0x52 },
            { type: "up", input: 0xa1 },
            { type: "delay", ms: 17, jitterMs: 0 },
          ],
        },
      },
      ...blockWin,
    ],
  },
  {
    id: "any",
    name: "Any game",
    tagline: "Essentials for every game",
    apps: [],
    gameSettings: [],
    items: [
      ...blockWin,
      {
        key: "caps",
        title: "Disable Caps Lock",
        why: "For games where Caps Lock sits next to your movement keys and you never use it.",
        tier: "safe",
        defaultOn: false,
        trigger: { input: 0x14 },
        action: { type: "block" },
      },
      {
        key: "clicker",
        title: "Clicker-game auto-clicker on F6",
        why: "Toggles left-click at 20 per second for idle and clicker games.",
        tier: "input",
        defaultOn: false,
        trigger: { input: 0x75, mode: "toggle" },
        action: { type: "rapid", output: MOUSE_LEFT, rate: 20, holdMs: 0, jitterPct: 0 },
      },
    ],
  },
];

/** Does this action send input to the game? (Block does not.) */
export const sendsInput = (a: Action) => a.type !== "block";
