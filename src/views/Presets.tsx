// Game presets: the game's own settings first, then ready-made bindings.

import { useState } from "react";
import { ArrowRight, Check, Globe } from "lucide-react";

import { useNavigate } from "../components/Shell";
import { Button, cx, Eyebrow, Keycap, PageHeader, StatusBadge } from "../components/ui";
import { actionSummary, ACTION_TEXT, MODE_TEXT, newId } from "../lib/describe";
import { GAME_PRESETS, type GamePreset } from "../lib/presets";
import type { Binding, Data, Macro } from "../lib/types";
import { toast, update, useStore } from "../store";

/** Add the chosen items of a preset; returns [added, skipped as already bound]. */
function install(game: GamePreset, chosen: Set<string>): { profileId: string; added: number; skipped: number } {
  let result = { profileId: "", added: 0, skipped: 0 };
  update((d: Data) => {
    const profiles = [...d.profiles];
    let idx = game.apps.length
      ? profiles.findIndex((p) => p.apps.some((a) => game.apps.includes(a)))
      : profiles.findIndex((p) => p.id === "global");
    if (idx < 0) {
      profiles.push({ id: newId("p"), name: game.name, enabled: true, apps: [...game.apps], bindings: [] });
      idx = profiles.length - 1;
    }
    const profile = { ...profiles[idx]!, bindings: [...profiles[idx]!.bindings] };
    const macros: Macro[] = [...d.macros];
    let added = 0;
    let skipped = 0;
    for (const item of game.items.filter((i) => chosen.has(i.key))) {
      const mods = item.trigger.mods ?? 0;
      if (profile.bindings.some((b) => b.trigger.input === item.trigger.input && b.trigger.mods === mods)) {
        skipped++;
        continue;
      }
      let action = item.action;
      if (item.macro) {
        const m: Macro = { ...structuredClone(item.macro), id: newId("m") };
        macros.push(m);
        if (action.type === "macro") action = { ...action, macroId: m.id };
      }
      const b: Binding = {
        id: newId("b"),
        name: item.title.replace(/ (on|:) .*$/, "").replace(/:.*$/, ""),
        enabled: true,
        trigger: { input: item.trigger.input, mods, mode: item.trigger.mode ?? "press", passthrough: false },
        action,
      };
      profile.bindings.push(b);
      added++;
    }
    profiles[idx] = profile;
    result = { profileId: profile.id, added, skipped };
    return { ...d, profiles, macros };
  });
  return result;
}

/** Which profile a preset installs into: the game's profile, else Everywhere. */
function targetProfile(game: GamePreset, profiles: Data["profiles"]) {
  return game.apps.length ? profiles.find((p) => p.apps.some((a) => game.apps.includes(a))) : profiles.find((p) => p.id === "global");
}

/** A monogram tile per game (no game art: just its initials in the accent). */
function GameTile({ game, size = "md", active }: { game: GamePreset; size?: "md" | "lg"; active?: boolean }) {
  const initials = game.apps.length
    ? game.name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";
  return (
    <span
      className={cx(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl font-display font-extrabold tracking-wide",
        size === "lg" ? "size-16 text-xl" : "size-10 text-sm",
        active ? "bg-violet text-on-accent" : "bg-surface-3 text-ink",
      )}
    >
      <span aria-hidden className="absolute inset-0 texture-grid opacity-60" />
      <span className="relative">{initials || <Globe aria-hidden className={size === "lg" ? "size-7" : "size-5"} />}</span>
    </span>
  );
}

export function PresetsView() {
  const profiles = useStore((s) => s.data!.profiles);
  const [gid, setGid] = useState(GAME_PRESETS[0]!.id);
  const game = GAME_PRESETS.find((g) => g.id === gid)!;
  return (
    <>
      <PageHeader title="Game presets" description="Ready-made setups for popular games: the settings worth changing in the game, then bindings you add in one click." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Games" className="flex flex-col gap-1.5 lg:sticky lg:top-2 lg:self-start">
          {GAME_PRESETS.map((g) => {
            const on = g.id === gid;
            const target = targetProfile(g, profiles);
            const have = target ? g.items.filter((i) => target.bindings.some((b) => b.trigger.input === i.trigger.input && b.trigger.mods === (i.trigger.mods ?? 0))).length : 0;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGid(g.id)}
                aria-current={on || undefined}
                className={cx(
                  "relative flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors",
                  on ? "border-violet/60 bg-violet/10" : "border-transparent hover:border-line hover:bg-surface-1",
                )}
              >
                {on && <span aria-hidden className="absolute inset-y-2 -left-px w-[3px] rounded-r-sm bg-violet" />}
                <GameTile game={g} active={on} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{g.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{g.tagline}</span>
                </span>
                {have > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-md bg-lime/15 px-1.5 text-[11px] font-bold text-lime" title={`${have} of ${g.items.length} set up`}>
                    {have}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <GameDetail key={game.id} game={game} />
      </div>
    </>
  );
}

function GameDetail({ game }: { game: GamePreset }) {
  const navigate = useNavigate();
  const profiles = useStore((s) => s.data!.profiles);
  const target = targetProfile(game, profiles);
  const alreadyBound = (i: GamePreset["items"][number]) =>
    !!target?.bindings.some((b) => b.trigger.input === i.trigger.input && b.trigger.mods === (i.trigger.mods ?? 0));
  const [chosen, setChosen] = useState(() => new Set(game.items.filter((i) => i.defaultOn && !alreadyBound(i)).map((i) => i.key)));
  const [done, setDone] = useState<string | null>(null);
  const toggle = (k: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const fresh = game.items.filter((i) => !alreadyBound(i));
  const pick = game.items.filter((i) => chosen.has(i.key) && !alreadyBound(i));
  const have = game.items.length - fresh.length;

  const go = () => {
    const res = install(game, chosen);
    toast(res.added ? `Added ${res.added} binding${res.added === 1 ? "" : "s"} to ${target?.name ?? game.name}` : "Nothing new: those keys are already in use");
    setDone(res.profileId);
    setChosen(new Set());
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface-1">
      <header className="relative flex flex-wrap items-center gap-4 border-b border-line px-7 py-6 texture-grid">
        <span aria-hidden className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full opacity-20 blur-3xl" style={{ background: "var(--color-violet)" }} />
        <span className="relative">
          <GameTile game={game} size="lg" active />
        </span>
        <div className="relative min-w-0 flex-1">
          <Eyebrow>{game.tagline}</Eyebrow>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{game.name}</h2>
          <p className="mt-1 text-xs text-ink-muted">
            {game.apps.length ? (
              <>
                Switches on by itself while <span className="font-mono text-ink">{game.apps.join(" or ")}</span> is in front.
              </>
            ) : (
              "Works in every game and app."
            )}
          </p>
        </div>
        <span className="relative">
          {have > 0 ? (
            <StatusBadge tone="ok">
              {have} of {game.items.length} set up
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral" icon={false}>
              Not set up yet
            </StatusBadge>
          )}
        </span>
      </header>

      <div className="flex flex-col gap-7 px-7 py-6">
        {game.gameSettings.length > 0 && (
          <div>
            <p className="mb-3 flex items-center justify-between gap-3 text-sm font-extrabold tracking-tight">
              Set in the game
              {game.keybindSource && <span className="text-[11px] font-semibold text-ink-faint">Default keys: {game.keybindSource.label}</span>}
            </p>
            <ol className="flex flex-col gap-2">
              {game.gameSettings.map((t, i) => (
                <li key={t} className="flex gap-3 rounded-xl border border-line bg-surface-0/40 px-4 py-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-3 font-mono text-[11px] font-bold text-ink-muted">{i + 1}</span>
                  <span className="text-ink">{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {game.items.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold tracking-tight">Bindings</p>
              {fresh.length > 1 && (
                <div className="flex gap-3 text-xs font-bold">
                  <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setChosen(new Set(fresh.map((i) => i.key)))}>
                    Select all
                  </button>
                  <button type="button" className="text-ink-muted hover:text-ink" onClick={() => setChosen(new Set())}>
                    None
                  </button>
                </div>
              )}
            </div>
            <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              {game.items.map((i) => {
                const bound = alreadyBound(i);
                const on = chosen.has(i.key) && !bound;
                return (
                  <li key={i.key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={bound}
                      onClick={() => toggle(i.key)}
                      className={cx(
                        "flex h-full w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                        bound ? "border-lime/30 bg-lime/[0.04]" : on ? "border-violet/60 bg-violet/[0.08]" : "border-line hover:border-line-strong",
                      )}
                    >
                      <span
                        className={cx(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
                          bound ? "border-lime bg-lime text-black" : on ? "border-violet bg-violet text-on-accent" : "border-line-strong",
                        )}
                      >
                        {(on || bound) && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Keycap input={i.trigger.input} mods={i.trigger.mods ?? 0} />
                          <span className="text-sm font-bold">{i.title}</span>
                        </span>
                        <span className="mt-1.5 block text-xs leading-relaxed text-ink-muted">{i.why}</span>
                        <span className="mt-1.5 block text-[11px] text-ink-faint">
                          {bound
                            ? "Already set up"
                            : `${ACTION_TEXT[i.action.type].label}${i.action.type !== "macro" && i.action.type !== "block" ? ` · ${actionSummary(i.action, [])}` : ""}${i.trigger.mode && i.action.type !== "holdLock" ? ` · ${MODE_TEXT[i.trigger.mode].label}` : ""}${i.macro ? ` · ${i.macro.steps.length} steps` : ""}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {game.items.length > 0 && (
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-surface-1/95 px-7 py-4 backdrop-blur">
          <div className="min-w-0 flex-1 text-sm">
            {done ? (
              <span className="inline-flex items-center gap-2 font-bold text-lime">
                <Check aria-hidden className="size-4" /> Added.
                <button type="button" onClick={() => navigate({ view: "bindings", focus: done })} className="inline-flex items-center gap-1 font-bold text-ink hover:underline">
                  See them in Bindings <ArrowRight aria-hidden className="size-3.5" />
                </button>
              </span>
            ) : pick.length ? (
              <span className="text-ink-muted">
                Adds <span className="font-bold text-ink">{pick.length}</span> binding{pick.length === 1 ? "" : "s"} to{" "}
                <span className="font-bold text-ink">{target ? target.name : `a new “${game.name}” profile`}</span>. Keys you already use are left alone.
              </span>
            ) : (
              <span className="text-ink-muted">{fresh.length ? "Choose the bindings to add." : "Everything here is already set up."}</span>
            )}
          </div>
          <Button variant="primary" disabled={pick.length === 0} icon={<ArrowRight aria-hidden className="size-4" />} onClick={go}>
            Add to MacroForge
          </Button>
        </footer>
      )}
    </section>
  );
}
