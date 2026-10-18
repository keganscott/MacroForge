// Perfect 180: one side button turns you around. Pick the game and your
// in-game sensitivity (or find it by testing), check it in the game with a
// countdown, then put it on a button. See src/lib/turn.ts for the maths.

import { useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Play, RotateCw, Target } from "lucide-react";

import { KeyField, type KeyValue } from "../components/KeyField";
import { Button, Card, cx, Field, NumberField, Segmented, Select, Switch } from "../components/ui";
import { newId } from "../lib/describe";
import { keyName, MOUSE_X1, MOUSE_X2 } from "../lib/keys";
import { countsFor180, errorDegrees, fullCircleSteps, TURN_GAMES, TURN_SPEEDS, turnSteps, type TurnSpeed } from "../lib/turn";
import type { Action, Conditions, Macro, Trigger } from "../lib/types";
import { backend } from "../store";

type AddFn = (name: string, trigger: Partial<Trigger> & { input: number }, action: Action, macro?: Macro, conditions?: Conditions) => void;

export function TurnTool({ onAdd }: { onAdd: AddFn }) {
  const [gameId, setGameId] = useState("cs2");
  const game = TURN_GAMES.find((g) => g.id === gameId)!;
  const [sens, setSens] = useState(game.sens);
  const computed = countsFor180(game, sens);
  const [counts, setCounts] = useState(computed ?? 5000);
  const [nudged, setNudged] = useState(false);
  const [right, setRight] = useState(true);
  const [speed, setSpeed] = useState<TurnSpeed>("snap");
  const [key, setKey] = useState<KeyValue>({ input: MOUSE_X1, mods: 0 });
  const [pauseMenus, setPauseMenus] = useState(true);
  const [countdown, setCountdown] = useState<{ n: number; what: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Game or sensitivity changed: recompute (a fine-tune is reset).
  useEffect(() => {
    if (computed !== null) {
      setCounts(computed);
      setNudged(false);
    }
  }, [computed]);
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const nudge = (d: number) => {
    setCounts((c) => Math.max(1, Math.min(200_000, c + d)));
    setNudged(true);
  };

  const test = (circle: boolean) => {
    if (timer.current) clearInterval(timer.current);
    const steps = circle ? fullCircleSteps(counts, right, speed) : turnSteps(counts, right, speed);
    let n = 3;
    const what = circle ? "Full circle" : "180° turn";
    setCountdown({ n, what });
    timer.current = setInterval(() => {
      n -= 1;
      if (n > 0) setCountdown({ n, what });
      else {
        clearInterval(timer.current!);
        setCountdown(null);
        void backend().playSteps("turn-test", what, steps);
      }
    }, 1000);
  };

  const add = () => {
    const label = game.yaw ? `${game.name.replace(/ \(.*\)$/, "")}, sens ${sens}` : `${counts} counts`;
    const m: Macro = { id: newId("m"), name: `180° turn (${label})`, steps: turnSteps(counts, right, speed) };
    onAdd(
      "180° turn",
      { input: key.input, mods: key.mods, mode: "press" },
      { type: "macro", macroId: m.id, repeat: 1, onRepress: "ignore", stopImmediately: true },
      m,
      { whileHeld: 0, pauseInMenus: pauseMenus },
    );
  };

  const err = game.yaw ? errorDegrees(game, sens, counts) : 0;
  const speedInfo = TURN_SPEEDS.find((s) => s.id === speed)!;

  return (
    <Card className="xl:col-span-2">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet text-on-accent">
          <RotateCw aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight">
            Perfect 180
            <span className="rounded-md border border-violet/40 bg-violet/10 px-1.5 py-px text-[10px] font-bold tracking-wider text-violet-soft uppercase">New</span>
          </h2>
          <p className="text-xs text-ink-muted">
            One button turns you around exactly 180°, calibrated to your game and sensitivity. The same idea as Razer’s Perfect 180, on any mouse.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* ---------------------------------------------- calibrate */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <Field label="Game">
              <Select label="Game" value={gameId} onChange={(id) => {
                setGameId(id);
                const g = TURN_GAMES.find((x) => x.id === id)!;
                setSens(g.sens);
              }} options={TURN_GAMES.map((g) => ({ value: g.id, label: g.name }))} />
            </Field>
            {game.yaw > 0 && (
              <Field label="In-game sensitivity">
                <NumberField label="In-game sensitivity" min={0.001} max={1000} step={0.05} value={sens} onChange={setSens} width="w-24" />
              </Field>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface-0/50 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">Mouse movement for 180°</p>
                <p className="mt-1 font-mono text-3xl font-bold tabular-nums">
                  {counts.toLocaleString()}
                  <span className="ml-2 text-sm font-semibold text-ink-muted">counts</span>
                </p>
              </div>
              <p className="max-w-56 text-right text-[11px] leading-relaxed text-ink-muted">
                {game.yaw
                  ? nudged
                    ? `Fine-tuned from ${computed?.toLocaleString()}.`
                    : `180 ÷ (${game.yaw} × ${sens}). Off by ${err < 0.005 ? "under 0.005" : err.toFixed(3)}° after rounding.`
                  : "Use Full circle in your game and nudge until you end up exactly where you started."}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-ink-faint">Fine-tune</span>
              {[-100, -10, -1, 1, 10, 100].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => nudge(d)}
                  className="h-7 min-w-11 rounded-md border border-line-strong px-2 font-mono text-xs font-bold text-ink-muted hover:border-violet hover:text-ink"
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
              <NumberField
                label="Counts"
                min={1}
                max={200000}
                value={counts}
                onChange={(v) => {
                  setCounts(Math.round(v));
                  setNudged(true);
                }}
                width="w-24"
                className="ml-auto"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Speed" hint={speedInfo.hint}>
              <Segmented size="sm" label="Speed" value={speed} onChange={setSpeed} options={TURN_SPEEDS.map((s) => ({ value: s.id, label: s.label }))} />
            </Field>
            <Field label="Direction">
              <Segmented
                size="sm"
                label="Direction"
                value={right ? "right" : "left"}
                onChange={(v) => setRight(v === "right")}
                options={[
                  { value: "right", label: "Turn right" },
                  { value: "left", label: "Turn left" },
                ]}
              />
            </Field>
          </div>
        </div>

        {/* ---------------------------------------------- test & bind */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-0/50 p-4 texture-grid">
            <TurnDial right={right} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Check it in your game</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                Press a test, switch to your game during the countdown and stand still. <span className="text-ink">Full circle</span> turns twice:
                you should face exactly where you started. Short of it, add counts; past it, remove some.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {countdown ? (
                  <Button size="sm" variant="go" onClick={() => {
                    if (timer.current) clearInterval(timer.current);
                    setCountdown(null);
                  }}>
                    {countdown.what} in {countdown.n}… (cancel)
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="primary" icon={<Play aria-hidden className="size-3.5" />} onClick={() => test(false)}>
                      Test 180°
                    </Button>
                    <Button size="sm" icon={<Target aria-hidden className="size-3.5" />} onClick={() => test(true)}>
                      Test full circle
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <Field label="Button">
            <KeyField label="Perfect 180 button" value={key} onChange={setKey} quick={[MOUSE_X1, MOUSE_X2]} />
          </Field>

          <div className={cx("flex items-center gap-3 rounded-lg border px-3 py-2.5", pauseMenus ? "border-violet/50 bg-violet/[0.06]" : "border-line")}>
            <MousePointer2 aria-hidden className={cx("size-4 shrink-0", pauseMenus ? "text-violet" : "text-ink-faint")} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">Pause in menus</p>
              <p className="text-[11px] text-ink-muted">While the game shows its cursor, {keyName(key.input)} works normally instead of flinging the cursor.</p>
            </div>
            <Switch label="Pause in menus" checked={pauseMenus} onChange={setPauseMenus} />
          </div>

          <div className="mt-auto flex items-center justify-end gap-3 border-t border-line pt-4">
            <span className="mr-auto text-xs text-ink-muted">
              {keyName(key.input)} → turn {right ? "right" : "left"} {counts.toLocaleString()} counts, {speedInfo.label.toLowerCase()}
            </span>
            <Button variant="primary" disabled={!key.input} onClick={add}>
              Add Perfect 180
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** A top-down view: you, facing up, swinging round to face down. */
function TurnDial({ right }: { right: boolean }) {
  const path = useMemo(() => (right ? "M 40 12 A 28 28 0 0 1 40 68" : "M 40 12 A 28 28 0 0 0 40 68"), [right]);
  const head = right ? "M 40 68 l 8 -2 M 40 68 l 5 -7" : "M 40 68 l -8 -2 M 40 68 l -5 -7";
  return (
    <svg viewBox="0 0 80 80" aria-hidden className="size-20 shrink-0">
      <circle cx="40" cy="40" r="28" fill="none" strokeWidth="1" strokeDasharray="2 4" className="stroke-line-strong" />
      <path d={path} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-violet" />
      <path d={head} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-violet" />
      <circle cx="40" cy="40" r="5" className="fill-lime" />
      <path d="M 40 33 L 40 22" strokeWidth="2" strokeLinecap="round" className="stroke-lime" />
      <text x={right ? 14 : 66} y="44" textAnchor="middle" className="fill-ink-muted font-mono" style={{ fontSize: 9, fontWeight: 700 }}>
        180°
      </text>
    </svg>
  );
}
