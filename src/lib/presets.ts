// Game presets. Each game says what its rules say about macros (with the
// source), what to set in the game itself first, and offers bindings in
// tiers:
//   safe  - nothing is sent to the game (e.g. the Windows key does nothing)
//   input - MacroForge sends keys / clicks to the game
// Keybinds are each game's PC defaults as published (sources below); if you
// changed yours in-game, change the binding's output to match.
//
// Checked 2026-10-17. Rules change: re-check the source before relying on it.

import { MOUSE_LEFT, MOUSE_RIGHT, MOUSE_X1, MOUSE_X2 } from "./keys";
import type { Action, Macro, TriggerMode } from "./types";

/** incompatible: the game's anti-cheat flags macro tools that are merely running.
 * forbidden: the rules ban macros. yours: up to you (single-player, your world). */
export type RulesLevel = "incompatible" | "forbidden" | "yours";

export interface GameRules {
  level: RulesLevel;
  /** One line, in plain words. */
  summary: string;
  source: { label: string; url: string };
}

export interface PresetItem {
  key: string;
  title: string;
  why: string;
  tier: "safe" | "input";
  /** Ticked when the preset opens. Only safe items, unless the game's rules are the player's own call. */
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
  rules: GameRules;
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
    rules: {
      level: "incompatible",
      summary:
        "ARC Raiders’ anti-cheat flags AutoHotkey, auto-clickers and macro tools while they are running, whether or not they send anything. Quit MacroForge (tray icon › Quit) before you launch it, and use the game’s own settings below instead.",
      source: { label: "Embark Help Center: “Cheat software detected”", url: "https://id.embark.games/arc-raiders/support/faq/163-fatal-error-cheat-software-detected" },
    },
    gameSettings: [
      "Settings › Controls: bind “Aim (Toggle)”. It is unassigned by default, and is the built-in way to aim without holding right-click.",
      "Settings › Controls: bind “Sprint (Toggle)”, also unassigned by default, for long topside runs without holding Left Shift.",
      "Crouch already has both: hold Left Ctrl, or toggle with C. Walk toggles with V.",
      "Ping defaults to Middle Mouse; you can move it to a side button in Settings › Controls.",
      "Settings › Audio: proximity chat defaults to push-to-talk on B, party chat to open mic.",
    ],
    items: [],
    keybindSource: { label: "arcraiders.wiki: Settings", url: "https://arcraiders.wiki/wiki/Settings" },
  },
  {
    id: "fortnite",
    name: "Fortnite",
    tagline: "Battle royale by Epic Games",
    apps: ["fortniteclient-win64-shipping.exe"],
    rules: {
      level: "forbidden",
      summary:
        "Epic treats macros as cheating, defined as one key doing a sequence of actions, and bans for it. It also removed double-movement binds for the same reason. Epic hasn’t published which running tools its anti-cheat flags. This preset only stops the Windows key and sends nothing to Fortnite; quitting MacroForge before you play is the safest choice.",
      source: { label: "Epic: Competitive integrity update (Dec 2020)", url: "https://www.fortnite.com/news/fortnite-chapter-2-season-5-competitive-integrity-update" },
    },
    gameSettings: [
      "Settings › Input: rebind anything you like there, including build pieces on mouse side buttons. That is the game’s own system and is allowed.",
      "Settings › Game: “Edit Hold Time” and “Edit on Release” make editing feel faster without any macro.",
      "Settings › Game: “Toggle Targeting” lets you aim without holding right-click.",
    ],
    items: blockWin.map((i) => ({ ...i, defaultOn: false })),
  },
  {
    id: "minecraft",
    name: "Minecraft",
    tagline: "Java and Bedrock, single-player and your own worlds",
    apps: ["javaw.exe", "minecraft.windows.exe"],
    rules: {
      level: "yours",
      summary:
        "In single-player and on your own worlds it is your call. Multiplayer servers set their own rules and many ban auto-clickers, so check before using these on a server. (javaw.exe is shared by every Java app, so this profile is also active in other Java programs.)",
      source: { label: "Each server publishes its own rules", url: "" },
    },
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
    rules: {
      level: "yours",
      summary:
        "Single-player and co-op with friends, with no anti-cheat: your call. Animation cancelling (Right Shift + R + Delete right after a tool lands) is a long-standing PC technique; these presets just time it for you.",
      source: { label: "Stardew forums: animation canceling script (timings)", url: "https://forums.stardewvalley.net/threads/a-better-animation-canceling-autohotkey-script.7391" },
    },
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
    rules: {
      level: "yours",
      summary:
        "The key blockers only stop keys from doing things; nothing is sent to the game. The auto-clicker does send input, so it is off until you tick it: keep it to games that allow it, and quit MacroForge before playing games whose anti-cheat flags macro tools (see ARC Raiders).",
      source: { label: "Check each game’s own rules", url: "" },
    },
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
        why: "Toggles left-click at 20 per second for idle and clicker games. Sends input, so keep it out of games whose rules forbid it.",
        tier: "input",
        defaultOn: false,
        trigger: { input: 0x75, mode: "toggle" },
        action: { type: "rapid", output: MOUSE_LEFT, rate: 20, holdMs: 0, jitterPct: 0 },
      },
    ],
  },
];

/** Rules for an app (lower-case exe), if MacroForge knows the game. */
export function rulesFor(apps: string[]): { game: GamePreset; rules: GameRules } | null {
  for (const g of GAME_PRESETS) {
    if (g.apps.some((a) => apps.includes(a))) return { game: g, rules: g.rules };
  }
  return null;
}

/** Does this action send input to the game? (Block does not.) */
export const sendsInput = (a: Action) => a.type !== "block";
