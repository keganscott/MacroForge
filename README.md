# MacroForge

Fast, precise keyboard and mouse macros for Windows, for games that allow
them. It is the third app in the family after PeakTweaks and Crosshair Forge.
It shares the family's DNA (true black, lime for "on", the sidebar shell, the
type and the two-weight wordmark) but has its own signature: Signal cyan,
keycaps, and key presses drawn as signal traces. See
[`docs/DESIGN.md`](docs/DESIGN.md).

Built like PeakTweaks: a Tauri 2 shell, a Rust engine crate, and a
React/TypeScript/Tailwind UI.

## What it does

- **Quick tools.** Auto-clicker, turbo key, remap, auto-run / hold lock,
  scroll spam, text snippets, and disable-a-key (for example both Windows
  keys). Each takes two clicks and becomes a normal binding you can
  fine-tune.
- **Game presets.** Each game card says plainly what its rules allow (with the
  source), lists the game's own settings to use first, then offers bindings
  marked "Sends nothing to the game" or "Sends input". Install never
  overwrites a key you already use. Home warns you, with a Quit button, when
  a game in front has rules or anti-cheat against macros.
  - **ARC Raiders:** its anti-cheat flags macro tools that are merely running
    (Embark Help Center), so the preset is guidance only: quit MacroForge
    before playing, and bind the game's own Aim (Toggle) and Sprint (Toggle).
  - **Fortnite:** Epic bans macros. Only optional Windows-key blocking, which
    sends nothing to the game.
  - **Minecraft:** mob-farm attacker at the 1.6/s full-damage sword rhythm,
    AFK fishing, hold to mine, auto-walk, and fast place at the game's own
    5/s cap.
  - **Stardew Valley:** animation-cancel fast tools and watering can, timed
    from the community's tested script (1-frame click, 5- or 9-frame wait,
    Right Shift + R + Delete).
  - **Any game:** Windows key, Caps Lock, and a clicker-game auto-clicker
    (off by default).
- **Bindings.** Any key, mouse button (including Mouse 4/5), or wheel
  direction, with optional Ctrl / Shift / Alt / Win, can:
  - play a macro, in Press, Hold or Toggle mode, with repeat counts and a
    choice of what a re-press does
  - rapid fire a key or button at 0.1–1000 per second, with hold time and
    timing variation
  - remap to another key or a shortcut (Ctrl + C)
  - hold a key down until pressed again
  - disable the key
- **"Only when…" conditions** (rapid fire and macros):
  - **Only while aiming:** fires only while a second button is held (right
    click by default, or Mouse 4/5). Without it the trigger is a normal
    click, so inventory drags work. Letting go of aim stops a burst at once.
  - **Pause in menus:** clicks go through normally whenever the game shows
    its mouse cursor (inventory, map, menus). A cursor that is hidden, has
    a null image, or is pinned for mouse-look counts as gameplay. **Test in
    my game** shows what MacroForge sees on the in-game notice for 20
    seconds.
  - A "What happens" table in the editor spells out every case. Bursts
    re-check before each press and keep their rhythm when they resume.
    Verified live with `examples/conditions_check.rs`.
- **Macros.** Steps for key/click (with hold time), hold down, release,
  wait (± random), type text, scroll, relative mouse move (optionally smooth
  over a duration), and cursor to (x, y). You can drag to reorder, duplicate,
  and test play with a 3-2-1 countdown. A **timeline** draws the macro as
  signal lanes, one per key, and a playhead follows test play.
- **Recorder.** Records keys and buttons in other apps (not MacroForge's own
  window), with timing as performed, a fixed gap, or no waits. It can also
  record mouse movement.
- **Game profiles.** A profile can be limited to apps such as `cs2.exe`
  (chosen from "Running now"). It switches on by itself while that game is in
  front, and anything it was running or holding stops when you switch away.
- **Always in control.** Scroll Lock turns all bindings on or off; Pause stops
  everything and lets go of every held key (both are rebindable). Bindings
  pause while MacroForge's own window is in front, so you can type in it.
- **On-screen notice and sounds.** A small notice ("Auto-clicker · ON") when a
  toggle changes. It is a click-through window that never takes focus. The
  sound cues are soft and quiet: a key-switch click, a glass chime or a pop,
  30 % volume by default, adjustable, with a test button.
- **Tray and activity.** The tray icon lights up cyan while bindings are on
  and turns grey when they're off. Home lists recent activity: toggles,
  on/off, Stop all, and game profiles switching in and out.
- **Share codes.** Copy a profile as an `MF1-…` code; Import adds it as a new
  profile and never overwrites anything.
- **Performance, measured.** A timing test on your PC (both timing modes),
  input-hook cost per event, trigger-to-output latency (median / p99 /
  slowest), sends Windows refused, and a live input monitor.

## How the engine gets its timing

- **Hook thread** (time-critical priority): Windows low-level keyboard and
  mouse hooks. The callback does a table lookup and returns. Mouse movement
  takes a fast path, and the mouse hook is only installed while something
  needs mouse buttons. The trigger table is swapped whole on change
  (`table.rs`), so the hook never waits on a half-built table.
- **Engine thread**: starts and stops runs. Remaps are sent straight from
  here.
- **One worker per running macro or rapid fire** (high priority). Waits use a
  high-resolution waitable timer (Windows 10 1803+, no global
  `timeBeginPeriod`). In Precise mode a spin on the performance counter
  covers the last 0.8 ms. Every wait also watches the run's stop event, so
  Stop is instant. Schedules are absolute, so long macros never drift.
- **SendInput with scan codes** (and the extended flag where needed), so games
  that read DirectInput or raw input see the keys. Each event is tagged so
  the hook passes MacroForge's own output straight through.
- **Stuck-key guard**: every run releases whatever it pressed, whether it
  ends, is stopped, or panics. Stop all, switching games, and turning
  bindings off also release hold-locks and remapped keys.

## What it costs your PC

Measured on the development PC with `tools/measure.ps1`, which covers the app
and all of its WebView2 processes:

| State | Processes | Private memory | CPU |
|---|---|---|---|
| In the tray (window closed) | 1 | ~2.5 MB | 0 % |
| Window open, behind a game | 7 | ~210 MB | ~0.1 % of one core |
| Window open and in use | 7 | ~210 MB | ~1 % of one core |
| Rapid fire running, Precise timing | | | +2–3 % of one core |
| Rapid fire running, Efficient timing | | | ~0 % |

How it stays that small:
- **Closing the window hands off to a tray-only copy.** That takes about a
  quarter of a second, and bindings and their on/off state carry over.
  WebView2 keeps its browser processes for the life of any process that ever
  opened a window, so the window lives in a copy that can go away.
- **The on-screen notice is drawn natively** (`src-tauri/src/hud.rs`), not in
  a second browser window.
- **The engine never wakes when idle.** The input monitor's 50 ms tick exists
  only while the monitor is on.
- **The mouse hook is installed only when bindings are on and something
  needs mouse buttons.**
- **Every animation moves or fades only** (no repainting), and nothing
  animates or polls while MacroForge is in the background.
- **Macro threads are started once and parked.** Pressing a trigger never
  waits for a new thread (`examples/start_check.rs`, `load_check.rs`).

## Fair play

MacroForge uses only documented Windows APIs: input hooks and `SendInput`,
the same ones on-screen keyboards use. It installs no driver, injects nothing
into any game, hides nothing, and makes no network connections. Windows marks
its input as synthetic, like any other program's.

Some games and anti-cheat systems forbid automated input in all or some
modes. MacroForge does not try to get around that. Use it only where the
game's rules allow macros.

If a game runs as administrator, Windows blocks input from normal programs
into it. Home then shows a button to restart MacroForge as administrator.

## Run it

```
npm install
npx tauri dev                 # the real app, hot-reloading UI
npm run dev                   # UI only, in a browser, on SAMPLE data (labelled)
```

Build the exe:

```
npx tauri build --no-bundle   # target\release\macroforge.exe
```

Rust build output goes to `%LOCALAPPDATA%\MacroForge-build\target` (see
`.cargo/config.toml`), because this folder is in OneDrive.

## Tests

```
cargo test -p macroforge-engine   # model, gate (hook decisions), table, runner timing, engine, recorder, store
npm test                          # keys, share codes, helpers
npm run typecheck
```

## Layout

| Path | What |
|---|---|
| `crates/engine/src/model.rs` | Profiles, bindings, macros, settings, and `sanitize` (every number clamped) |
| `crates/engine/src/gate.rs` | The hook's decision for each event: pass or swallow, hotkeys, key capture, recording |
| `crates/engine/src/table.rs` | Trigger table: most specific binding wins, game profiles over Everywhere |
| `crates/engine/src/runner.rs` | Macro playback and rapid fire on absolute schedules; `Held` releases keys on every exit |
| `crates/engine/src/engine.rs` | Engine thread: modes (press / hold / toggle), remaps, hold-locks, game switching, stats |
| `crates/engine/src/recorder.rs` | Recorded events to steps |
| `crates/engine/src/win/` | Hooks, SendInput, high-resolution timer, foreground app, start with Windows |
| `src-tauri/` | Tauri shell: commands, tray, single instance, HUD overlay, sounds |
| `src/` | UI: `views/` (Home, Quick tools, Bindings, Macros, Performance, Settings), `components/`, `lib/` |
| `tools/make_icon.py` | Draws the icon (needs Pillow) |

Data is saved to `%APPDATA%\MacroForge\macroforge.json`. Writes are atomic,
the previous save is kept as `.bak`, and an unreadable file is kept as
`.broken` while the backup loads.
