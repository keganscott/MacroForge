// "Only when…": the two conditions a rapid fire or macro binding can have.
//   Only while aiming - fires only while another key / button is held.
//   Pause in menus     - lets clicks through while the cursor is showing.
// Plus a plain "What happens" table, so it is clear what a click will do.

import { useEffect, useState } from "react";
import { ArrowRight, Crosshair, MousePointer2, Play, Radar } from "lucide-react";

import { isMouseButton, keyName, MOUSE_RIGHT, MOUSE_X1, MOUSE_X2 } from "../lib/keys";
import type { Action, Conditions, TriggerMode } from "../lib/types";
import { backend } from "../store";
import { cx, LiveDot, Switch } from "./ui";

const AIM_KEYS = [MOUSE_RIGHT, MOUSE_X1, MOUSE_X2];

/** A sensible "hold" key: right click, unless that is the trigger itself. */
export function defaultAimKey(trigger: number): number {
  return AIM_KEYS.find((k) => k !== trigger) ?? MOUSE_RIGHT;
}

function plainTrigger(trigger: number): string {
  return isMouseButton(trigger) ? "a normal click" : "a normal key press";
}

function firing(action: Action): string {
  return action.type === "macro" ? "Plays the macro" : "Rapid fire";
}

export function ConditionsEditor({
  value,
  onChange,
  trigger,
  action,
  mode,
}: {
  value: Conditions;
  onChange: (c: Conditions) => void;
  trigger: number;
  action: Action;
  mode: TriggerMode;
}) {
  const aimOn = value.whileHeld !== 0;
  const toggle = mode === "toggle";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* ---------------------------------------------- only while aiming */}
        <OptionCard
          on={aimOn}
          onToggle={(v) => onChange({ ...value, whileHeld: v ? defaultAimKey(trigger) : 0 })}
          icon={<Crosshair aria-hidden className="size-5" />}
          title="Only while aiming"
          text={
            toggle
              ? "While it is toggled on, it only fires while you hold a second button."
              : `Fires only while you hold a second button. Without it, ${keyName(trigger)} works as ${plainTrigger(trigger)}, so inventory drags and menus work.`
          }
        >
          <p className="mb-2 text-xs font-bold text-ink">Hold to fire</p>
          <div role="radiogroup" aria-label="Button to hold" className="flex flex-wrap gap-1.5">
            {AIM_KEYS.filter((k) => k !== trigger).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={value.whileHeld === k}
                onClick={() => onChange({ ...value, whileHeld: k })}
                className={cx(
                  "h-8 rounded-lg border px-3 text-xs font-bold transition-colors",
                  value.whileHeld === k ? "border-violet bg-violet text-on-accent" : "border-line-strong text-ink-muted hover:text-ink",
                )}
              >
                {keyName(k)}
                {k === MOUSE_RIGHT && <span className={cx("ml-1.5 font-semibold", value.whileHeld === k ? "opacity-70" : "text-ink-faint")}>aim</span>}
              </button>
            ))}
          </div>
        </OptionCard>

        {/* ---------------------------------------------- pause in menus */}
        <OptionCard
          on={value.pauseInMenus}
          onToggle={(v) => onChange({ ...value, pauseInMenus: v })}
          icon={<MousePointer2 aria-hidden className="size-5" />}
          title="Pause in menus"
          text={
            toggle
              ? "Stops firing whenever the game shows its mouse cursor (inventory, map, menus) and picks up again when you are back in play."
              : "Whenever the game shows its mouse cursor (inventory, map, menus), clicks go through normally. Back in play, it fires again."
          }
        >
          <CursorTest />
        </OptionCard>
      </div>

      <WhatHappens value={value} trigger={trigger} action={action} toggle={toggle} />
    </div>
  );
}

function OptionCard({
  on,
  onToggle,
  icon,
  title,
  text,
  children,
}: {
  on: boolean;
  onToggle: (v: boolean) => void;
  icon: React.ReactNode;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx("flex flex-col rounded-xl border p-4 transition-colors", on ? "border-violet/60 bg-violet/[0.07]" : "border-line bg-surface-2")}>
      <div className="flex items-start gap-3">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", on ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted")}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold tracking-tight">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{text}</p>
        </div>
        <Switch label={title} checked={on} onChange={onToggle} />
      </div>
      {on && <div className="mt-4 border-t border-line pt-3">{children}</div>}
    </div>
  );
}

/** Live check: does this game hide its cursor during play? */
function CursorTest() {
  const [left, setLeft] = useState(0);
  const [visible, setVisible] = useState<boolean | null>(null);
  useEffect(
    () =>
      backend().onCursorTest((t) => {
        setLeft(t.left);
        setVisible(t.visible);
      }),
    [],
  );
  const running = left > 0;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={running}
          onClick={() => {
            setLeft(20);
            void backend().cursorTest(20);
          }}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors",
            running ? "bg-lime/15 text-lime" : "border border-line-strong text-ink hover:bg-surface-3",
          )}
        >
          {running ? <Radar aria-hidden className="size-3.5 animate-pulse" /> : <Play aria-hidden className="size-3.5" />}
          {running ? `Testing · ${left}s` : "Test in my game"}
        </button>
        {running && visible !== null && (
          <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold", visible ? "bg-surface-3 text-ink-muted" : "bg-lime text-black")}>
            {visible ? "Cursor showing: menu" : "Cursor hidden: gameplay"}
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        {running
          ? "Switch to your game now. Open and close the inventory: the notice at the top of the screen should flip between “Gameplay” and “Menu”."
          : "Checks that your game hides the cursor during play (most do). For 20 seconds the on-screen notice shows what MacroForge sees."}
      </p>
    </div>
  );
}

/** "Hold Left click" for a held binding, "Press F" for a press binding. */
function triggerPhrase(action: Action, trigger: number): string {
  return `${action.type === "rapid" ? "Hold" : "Press"} ${keyName(trigger)}`;
}

/** Every situation, and what a press does in it. */
function WhatHappens({ value, trigger, action, toggle }: { value: Conditions; trigger: number; action: Action; toggle: boolean }) {
  const fire = firing(action);
  const normal = toggle ? "Paused" : plainTrigger(trigger).replace(/^a /, "").replace(/^\w/, (c) => c.toUpperCase());
  const aim = value.whileHeld ? keyName(value.whileHeld) : "";
  const rows: { when: string; fires: boolean }[] = [];
  // e.g. "Hold Left click while holding Right click, in gameplay"
  const base = toggle ? "Toggled on" : triggerPhrase(action, trigger);
  const sep = toggle ? ", " : " ";
  if (!value.whileHeld && !value.pauseInMenus) {
    rows.push({ when: toggle ? "Toggled on, anywhere" : `${base}, anywhere`, fires: true });
  } else {
    rows.push({ when: `${base}${aim ? `${sep}${toggle ? "" : "while "}holding ${aim}` : ""}${value.pauseInMenus ? ", in gameplay" : ""}`, fires: true });
    if (aim) rows.push({ when: `${base}${sep}${toggle ? "not holding" : "without holding"} ${aim}`, fires: false });
    if (value.pauseInMenus) rows.push({ when: `${base}${toggle ? ", " : " "}in the inventory, map or a menu`, fires: false });
  }
  return (
    <div className="rounded-xl border border-line bg-surface-0/50 p-3">
      <p className="mb-2 px-1 text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">What happens</p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.when} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 text-ink">{r.when}</span>
            <ArrowRight aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
            <span
              className={cx(
                "inline-flex w-36 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold",
                r.fires ? "bg-lime text-black" : "border border-line-strong text-ink-muted",
              )}
            >
              {r.fires && <LiveDot className="bg-black" />}
              {r.fires ? fire : normal}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Short labels for the Bindings list. */
export function conditionBadges(c: Conditions | undefined): string[] {
  if (!c) return [];
  const out: string[] = [];
  if (c.whileHeld) out.push(c.whileHeld === MOUSE_RIGHT ? "While aiming" : `While holding ${keyName(c.whileHeld)}`);
  if (c.pauseInMenus) out.push("Not in menus");
  return out;
}

/** The same two options, compact, for the Quick tools cards. */
export function ConditionsQuick({ value, onChange, trigger, toggle }: { value: Conditions; onChange: (c: Conditions) => void; trigger: number; toggle: boolean }) {
  const row = (on: boolean, set: (v: boolean) => void, icon: React.ReactNode, title: string, hint: string, extra?: React.ReactNode) => (
    <div className={cx("rounded-lg border px-3 py-2.5", on ? "border-violet/50 bg-violet/[0.06]" : "border-line")}>
      <div className="flex items-center gap-3">
        <span className={cx("shrink-0", on ? "text-violet" : "text-ink-faint")}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink">{title}</p>
          <p className="text-[11px] text-ink-muted">{hint}</p>
        </div>
        <Switch label={title} checked={on} onChange={set} />
      </div>
      {on && extra}
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {row(
        value.whileHeld !== 0,
        (v) => onChange({ ...value, whileHeld: v ? defaultAimKey(trigger) : 0 }),
        <Crosshair aria-hidden className="size-4" />,
        "Only while aiming",
        toggle ? "When on, fires only while a second button is held." : "Otherwise the key works normally (inventory, menus).",
        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
          {AIM_KEYS.filter((k) => k !== trigger).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={value.whileHeld === k}
              onClick={() => onChange({ ...value, whileHeld: k })}
              className={cx(
                "h-7 rounded-md border px-2.5 text-[11px] font-bold",
                value.whileHeld === k ? "border-violet bg-violet text-on-accent" : "border-line-strong text-ink-muted hover:text-ink",
              )}
            >
              Hold {keyName(k)}
            </button>
          ))}
        </div>,
      )}
      {row(
        value.pauseInMenus,
        (v) => onChange({ ...value, pauseInMenus: v }),
        <MousePointer2 aria-hidden className="size-4" />,
        "Pause in menus",
        "Normal clicks while the game shows its cursor.",
      )}
    </div>
  );
}
