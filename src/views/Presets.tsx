// Game presets: the game's own settings first, then ready-made bindings.

import { useState } from "react";
import { ArrowRight, BookOpen, Check, Gamepad2, Globe } from "lucide-react";

import { useNavigate } from "../components/Shell";
import { Button, Callout, Card, cx, Eyebrow, Keycap, PageHeader, SectionTitle } from "../components/ui";
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

export function PresetsView() {
  const [gid, setGid] = useState(GAME_PRESETS[0]!.id);
  const game = GAME_PRESETS.find((g) => g.id === gid)!;
  return (
    <>
      <PageHeader
        title="Game presets"
        description="Ready-made setups for popular games: what to set in the game itself, then bindings you can add in one click."
      />
      <div className="grid grid-cols-[260px_1fr] gap-6">
        <div className="flex flex-col gap-2">
          {GAME_PRESETS.map((g) => {
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGid(g.id)}
                aria-current={g.id === gid || undefined}
                className={cx(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  g.id === gid ? "border-violet bg-violet/10" : "border-line bg-surface-1 hover:border-line-strong",
                )}
              >
                <span className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", g.id === gid ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted")}>
                  {g.apps.length ? <Gamepad2 aria-hidden className="size-4" /> : <Globe aria-hidden className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{g.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{g.tagline}</span>
                </span>
              </button>
            );
          })}
        </div>
        <GameDetail key={game.id} game={game} />
      </div>
    </>
  );
}

function GameDetail({ game }: { game: GamePreset }) {
  const navigate = useNavigate();
  const profiles = useStore((s) => s.data!.profiles);
  const [chosen, setChosen] = useState(() => new Set(game.items.filter((i) => i.defaultOn).map((i) => i.key)));
  const existing = game.apps.length ? profiles.find((p) => p.apps.some((a) => game.apps.includes(a))) : profiles.find((p) => p.id === "global");
  const toggle = (k: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const go = () => {
    const res = install(game, chosen);
    toast(
      res.added
        ? `Added ${res.added} binding${res.added === 1 ? "" : "s"}${res.skipped ? `, kept ${res.skipped} you already had on those keys` : ""}`
        : "Nothing new: those keys are already bound in that profile",
    );
    navigate({ view: "bindings", focus: res.profileId });
  };

  return (
    <div className="min-w-0">
      <Card className="mb-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <Eyebrow>{game.tagline}</Eyebrow>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{game.name}</h2>
            {game.apps.length > 0 && (
              <p className="mt-1 text-xs text-ink-muted">
                Active while <span className="font-mono text-ink">{game.apps.join(" or ")}</span> is in front.
              </p>
            )}
          </div>
        </div>
      </Card>

      {game.gameSettings.length > 0 && (
        <div className="mb-6">
          <SectionTitle aside={game.keybindSource ? `Defaults: ${game.keybindSource.label}` : undefined}>In the game’s own settings first</SectionTitle>
          <Card className="p-2">
            <ul>
              {game.gameSettings.map((t) => (
                <li key={t} className="flex gap-3 px-3 py-2.5 text-sm">
                  <BookOpen aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {game.items.length > 0 ? (
        <>
          <SectionTitle aside={existing ? `Adds to “${existing.name}”` : `Creates a “${game.name}” profile`}>MacroForge bindings</SectionTitle>
          <ul className="flex flex-col gap-2">
            {game.items.map((i) => {
              const on = chosen.has(i.key);
              return (
                <li key={i.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(i.key)}
                    className={cx(
                      "flex w-full items-start gap-4 rounded-2xl border bg-surface-1 px-4 py-3 text-left transition-colors",
                      on ? "border-violet/60" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className={cx("mt-1 grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-violet bg-violet text-on-accent" : "border-line-strong")}>
                      {on && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="w-36 shrink-0 pt-0.5">
                      <Keycap input={i.trigger.input} mods={i.trigger.mods ?? 0} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{i.title}</span>
                      </span>
                      <span className="mt-1 block text-xs text-ink-muted">{i.why}</span>
                      <span className="mt-1.5 block text-[11px] text-ink-faint">
                        {ACTION_TEXT[i.action.type].label}
                        {i.action.type !== "macro" && i.action.type !== "block" ? ` · ${actionSummary(i.action, [])}` : ""}
                        {i.trigger.mode && i.action.type !== "holdLock" ? ` · ${MODE_TEXT[i.trigger.mode].label}` : ""}
                        {i.macro ? ` · ${i.macro.steps.length} steps` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex items-center justify-end gap-3">
            <span className="text-xs text-ink-muted">
              {chosen.size} of {game.items.length} chosen · keys you already use in that profile are left alone
            </span>
            <Button variant="primary" disabled={chosen.size === 0} icon={<ArrowRight aria-hidden className="size-4" />} onClick={go}>
              Add to MacroForge
            </Button>
          </div>
        </>
      ) : (
        <Callout tone="info" title="No ready-made bindings for this game yet">
          Use Quick tools or Bindings to set up your own.
        </Callout>
      )}
    </div>
  );
}
