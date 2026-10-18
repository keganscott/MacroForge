# MacroForge: working brief

Keyboard and mouse macro app for Windows (Tauri 2 shell, Rust engine, React/TS/Tailwind UI). Sister app of PeakTweaks (`~/Desktop/PC-TWEAK-APP`) and Crosshair Forge (`~/crosshair-forge`); it shares their design tokens (`src/index.css`, copied from PeakTweaks) and UI primitives (`src/components/ui.tsx`). Owner: Kegan. See README.md for features and layout.

## Rules
- Never call something done without running it: `cargo test -p macroforge-engine`, `npm test`, `npm run typecheck`, then build.
- Documented APIs only (hooks + SendInput). No drivers, no injection into games, no network.
- No game-rules or fair-play messaging in the app or docs (Kegan's call, 2026-10-18).
- No efficacy claims in copy. Performance shows measured numbers only.
- SAMPLE mock (`src/lib/mock.ts`) only in `vite dev`, always labelled; never in a release bundle (`ipc.ts` gates it on `import.meta.env.DEV`).

## Invariants
- The hook callback (`win/hook.rs` -> `gate.rs`) must stay cheap: no allocation on the common path, no blocking, a read-lock to clone the table `Arc`. Windows removes hooks that exceed LowLevelHooksTimeout.
- A press and its release always go to the same binding (`Gate::matched`), even if the table or modifiers changed in between.
- MacroForge's own SendInput events carry `INJECT_TAG` and pass the hook untouched.
- Every run releases what it pressed (`runner::Held`, also on panic). Stop all, master off, switching away from a game profile, and quitting release hold-locks and remapped keys.
- Bindings pause while MacroForge's own window is in front (empty table).
- Key capture never takes left or right click (the UI needs them); Esc cancels (reported as input 0).
- `Data::sanitize` clamps everything the UI sends; the UI shows the clamped copy that comes back from `save_data`.
- Rust and TS types are mirrored by hand (`model.rs` / `engine.rs` and `src/lib/types.ts`). Change both together.

## Commands
- `cargo test -p macroforge-engine` (no Tauri needed)
- `npm test`, `npm run typecheck`, `npm run dev` (browser preview on :1430, SAMPLE data)
- `npx tauri dev`, `npx tauri build --no-bundle`
- Builds work offline from the seeded `Cargo.lock` / `package-lock.json` (taken from PeakTweaks).
- Build output: `%LOCALAPPDATA%\MacroForge-build\target` (`.cargo/config.toml`, kept out of OneDrive).
