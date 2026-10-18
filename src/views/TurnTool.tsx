// Perfect 180 and the sensitivity calculator. Pick the game and your
// sensitivity (or eDPI); games without a reliable published value are
// measured once with the full-circle test and saved. Check it in the game
// with a countdown, then put it on a button. The maths: src/lib/turn.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Play, RotateCw, Save, Target } from "lucide-react";

import { KeyField, type KeyValue } from "../components/KeyField";
import { Button, Card, cx, Field, NumberField, Segmented, StatusBadge, Switch } from "../components/ui";
import { newId } from "../lib/describe";
import { keyName, MOUSE_X1, MOUSE_X2 } from "../lib/keys";
import {
  cmPer360,
  countsFor,
  degPerCount,
  errorDegrees,
  fullCircleSteps,
  sensFromEdpi,
  TIER_TEXT,
  TURN_GAMES,
  TURN_SPEEDS,
  turnSteps,
  yawFromCalibration,
  type TurnSpeed,
} from "../lib/turn";
import type { Action, Conditions, Macro, Trigger } from "../lib/types";
import { backend, setSettings, toast, useStore } from "../store";

type AddFn = (name: string, trigger: Partial<Trigger> & { input: number }, action: Action, macro?: Macro, conditions?: Conditions) => void;

const round = (n: number, digits = 3) => Number(n.toFixed(digits));
const shortName = (name: string) => name.replace(/ \(.*\)$/, "").replace(/ \/.*$/, "");
const NO_CALIBRATIONS: { game: string; yaw: number }[] = [];

export function TurnTool({ onAdd }: { onAdd: AddFn }) {
  const saved = useStore((st) => st.data?.settings.turnCalibrations ?? NO_CALIBRATIONS);
  const [gameId, setGameId] = useState("cs2");
  const game = TURN_GAMES.find((g) => g.id === gameId)!;
  const [sens, setSens] = useState(game.sens);
  const [byEdpi, setByEdpi] = useState(false);
  const [edpi, setEdpi] = useState(1600);
  const [dpi, setDpi] = useState(800);
  // eDPI = DPI × sensitivity, so the sensitivity follows from both.
  const effSens = byEdpi ? (sensFromEdpi(edpi, dpi) ?? 0) : sens;
  const calibration = saved.find((c) => c.game === game.id);
  const perCount = degPerCount(game, effSens, saved);
  const computed = countsFor(180, perCount);
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

  // Minecraft's turn is cubic in its slider, so a per-sensitivity value
  // cannot be stored; its formula is used (and fine-tunes apply directly).
  const canCalibrate = game.id !== "minecraft" && effSens > 0;
  const saveCalibration = () => {
    const yaw = yawFromCalibration(counts, effSens);
    if (!yaw) return;
    setSettings({ turnCalibrations: [...saved.filter((c) => c.game !== game.id), { game: game.id, yaw }] });
    setNudged(false);
    toast(`Saved your ${shortName(game.name)} calibration`);
  };
  const forgetCalibration = () => {
    setSettings({ turnCalibrations: saved.filter((c) => c.game !== game.id) });
    toast(`Forgot your ${shortName(game.name)} calibration`);
  };

  const add = () => {
    const label = effSens > 0 ? `${shortName(game.name)}, sens ${round(effSens)}` : `${counts} counts`;
    const m: Macro = { id: newId("m"), name: `180° turn (${label})`, steps: turnSteps(counts, right, speed) };
    onAdd(
      "180° turn",
      { input: key.input, mods: key.mods, mode: "press" },
      { type: "macro", macroId: m.id, repeat: 1, onRepress: "ignore", stopImmediately: true },
      m,
      { whileHeld: 0, pauseInMenus: pauseMenus },
    );
  };

  const err = errorDegrees(perCount, counts);
  // What one count is worth as set now (after any fine-tune).
  const usedPerCount = counts > 0 ? 180 / counts : null;
  const tier = calibration && game.id !== "minecraft" ? null : TIER_TEXT[game.tier];
  const speedInfo = TURN_SPEEDS.find((s) => s.id === speed)!;
  const cm = cmPer360(usedPerCount, dpi);

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
            One button turns you around exactly 180°, worked out from your game and sensitivity (or eDPI). The same idea as Razer’s Perfect 180, on any mouse.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* ---------------------------------------------- calculator */}
        <div className="flex flex-col gap-5">
          <Field label="Game" hint={tier ? tier.hint : "Measured by you in this game, so it is used instead of any published value."}>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Game"
                value={gameId}
                onChange={(e) => {
                  const g = TURN_GAMES.find((x) => x.id === e.target.value)!;
                  setGameId(g.id);
                  setSens(g.sens);
                }}
                className="field min-w-64 flex-1 pr-8"
              >
                {(["verified", "community", "measure"] as const).map((t) => (
                  <optgroup key={t} label={t === "measure" ? "Measure once (no published value)" : TIER_TEXT[t].label}>
                    {TURN_GAMES.filter((g) => g.tier === t).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                        {saved.some((c) => c.game === g.id) ? "  (calibrated)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {tier ? (
                <StatusBadge tone={game.tier === "verified" ? "ok" : game.tier === "community" ? "info" : "warn"}>{tier.label}</StatusBadge>
              ) : (
                <StatusBadge tone="ok">Your calibration</StatusBadge>
              )}
            </div>
          </Field>

          <div className="flex flex-col gap-3">
            <Segmented
              size="sm"
              label="I know my"
              value={byEdpi ? "edpi" : "sens"}
              onChange={(v) => setByEdpi(v === "edpi")}
              options={[
                { value: "sens", label: "I know my sensitivity" },
                { value: "edpi", label: "I know my eDPI" },
              ]}
            />
            <div className="flex flex-wrap items-end gap-4">
              {byEdpi ? (
                <>
                  <Field label="eDPI">
                    <NumberField label="eDPI" min={1} max={1_000_000} step={10} value={edpi} onChange={setEdpi} width="w-28" />
                  </Field>
                  <Field label="Mouse DPI">
                    <NumberField label="Mouse DPI" min={50} max={64_000} step={50} value={dpi} onChange={setDpi} width="w-24" />
                  </Field>
                  <p className="pb-2.5 text-xs text-ink-muted">
                    = {game.sensLabel.toLowerCase()} <span className="font-mono font-bold text-ink">{effSens > 0 ? round(effSens) : "—"}</span>
                  </p>
                </>
              ) : (
                <>
                  <Field label={game.sensLabel}>
                    <NumberField label={game.sensLabel} min={0.0001} max={10_000} step={game.sensStep} value={sens} onChange={setSens} width="w-28" />
                  </Field>
                  <Field label="Mouse DPI (for cm/360)">
                    <NumberField label="Mouse DPI" min={50} max={64_000} step={50} value={dpi} onChange={setDpi} width="w-24" />
                  </Field>
                </>
              )}
            </div>
            <p className="text-[11px] text-ink-faint">
              Your mouse DPI never changes the turn (MacroForge sends exact counts); it is only used for eDPI and cm/360.
            </p>
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
              <p className="max-w-60 text-right text-[11px] leading-relaxed text-ink-muted">
                {perCount === null
                  ? "Not measured yet. Use Test full circle and nudge until you face exactly where you began, then save it."
                  : nudged
                    ? `Fine-tuned from ${computed?.toLocaleString()}.`
                    : `180 ÷ ${round(perCount, 6)}° per count, within ${err < 0.005 ? "0.005" : err.toFixed(3)}° of exact.`}
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

            <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3">
              {[
                ["Per count", usedPerCount ? `${round(usedPerCount, 5)}°` : "—"],
                ["180°", counts.toLocaleString()],
                ["360°", (counts * 2).toLocaleString()],
                ["cm / 360", cm ? `${cm.toFixed(1)} cm` : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">{k}</dt>
                  <dd className="font-mono text-sm font-bold text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            {canCalibrate && (perCount === null || nudged || calibration) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {(perCount === null || nudged) && (
                  <Button size="sm" variant="primary" icon={<Save aria-hidden className="size-3.5" />} onClick={saveCalibration}>
                    Save as my {shortName(game.name)} calibration
                  </Button>
                )}
                {calibration && !nudged && (
                  <Button size="sm" variant="ghost" onClick={forgetCalibration}>
                    Forget my calibration
                  </Button>
                )}
                <span className="text-[11px] text-ink-faint">Saved for this game; change your sensitivity later and it still works it out.</span>
              </div>
            )}
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
                  <Button
                    size="sm"
                    variant="go"
                    onClick={() => {
                      if (timer.current) clearInterval(timer.current);
                      setCountdown(null);
                    }}
                  >
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
