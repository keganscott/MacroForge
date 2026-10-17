# MacroForge

Fast, precise keyboard and mouse macros for Windows, for games that allow
them. It is the third app in the family after PeakTweaks and Crosshair Forge,
and uses the same design language: black surfaces, violet for actions, lime
for "on", a sidebar shell, and rounded bordered cards.

Built like PeakTweaks: a Tauri 2 shell, a Rust engine crate, and a
React/TypeScript/Tailwind UI.

## What it does

- **Quick tools.** Auto-clicker, turbo key, remap, auto-run / hold lock,
  scroll spam, text snippets, and disable-a-key (for example both Windows
  keys). Each takes two clicks and becomes a normal binding you can
  fine-tune.
- **Bindings.** Any key, mouse button (including Mouse 4/5), or wheel
  direction, with optional Ctrl / Shift / Alt / Win, can:
  - play a macro, in Press, Hold or Toggle mode, with repeat counts and a
    choice of what a re-press does
  - rapid fire a key or button at 0.1–1000 per second, with hold time and
    timing variation
  - remap to another key or a shortcut (Ctrl + C)
  - hold a key down until pressed again
  - disable the key
- **Macros.** Steps for key/click (with hold time), hold down, release,
  wait (± random), type text, scroll, relative mouse move (optionally smooth
  over a duration), and cursor to (x, y). You can drag to reorder, duplicate,
  and test play with a 3-2-1 countdown.
- **Recorder.** Records keys and buttons in other apps (not MacroForge's own
  window), with timing as performed, a fixed gap, or no waits. It can also
  record mouse movement.
- **Game profiles.** A profile can be limited to apps such as `cs2.exe`
  (chosen from "Running now"). It switches on by itself while that game is in
  front, and anything it was running or holding stops when you switch away.
- **Always in control.** Scroll Lock turns all bindings on or off; Pause stops
  everything and lets go of every held key (both are rebindable). Bindings
  pause while MacroForge's own window is in front, so you can type in it.
- **On-screen notice and sounds.** A small line ("Auto-clicker on") and a tone
  when a toggle changes. It is a click-through window that never takes
  focus.
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
