// "When I … do this": the one place a binding is built. Edits a draft;
// nothing changes until Save.

import { useEffect, useState } from "react";
import { Ban, Keyboard, ListVideo, Lock, Plus, Repeat2, Shuffle, Trash2, TriangleAlert } from "lucide-react";

import { ConditionsEditor } from "../components/Conditions";
import { FireRateHelper } from "../components/FireRate";
import { KeyField } from "../components/KeyField";
import { useNavigate } from "../components/Shell";
import { Button, Callout, cx, Dialog, Field, NumberField, Segmented, Select, Slider, Switch, TextInput } from "../components/ui";
import { ACTION_TEXT, conflicts, fmtRate, MODE_TEXT, newId } from "../lib/describe";
import { comboName, keyName, MOUSE_LEFT } from "../lib/keys";
import { NO_CONDITIONS, type Action, type ActionType, type Binding, type Conditions, type Data, type Macro, type TriggerMode } from "../lib/types";
import { toast, update, useStore } from "../store";

const ACTION_ICON: Record<ActionType, typeof Keyboard> = {
  macro: ListVideo,
  rapid: Repeat2,
  remap: Shuffle,
  holdLock: Lock,
  block: Ban,
};

export function blankBinding(): Binding {
  return {
    id: newId("b"),
    name: "",
    enabled: true,
    trigger: { input: 0, mods: 0, mode: "press", passthrough: false },
    action: { type: "remap", output: 0, mods: 0 },
    conditions: NO_CONDITIONS,
  };
}

function defaultAction(type: ActionType, b: Binding, macros: Macro[]): Action {
  switch (type) {
    case "macro":
      return { type, macroId: macros[0]?.id ?? "", repeat: 1, onRepress: "ignore", stopImmediately: true };
    case "rapid":
      return { type, output: b.trigger.input || MOUSE_LEFT, rate: 12, holdMs: 0, jitterPct: 0 };
    case "remap":
      return { type, output: 0, mods: 0 };
    case "holdLock":
      return { type, output: b.trigger.input || 0x57 };
    case "block":
      return { type };
  }
}

/** Modes that make sense for each action. */
const MODES: Record<ActionType, TriggerMode[]> = {
  macro: ["press", "hold", "toggle"],
  rapid: ["hold", "toggle"],
  remap: ["press"],
  holdLock: ["press"],
  block: ["press"],
};

export function BindingEditor({
  open,
  initial,
  profileId,
  onClose,
}: {
  open: boolean;
  initial: Binding | null;
  profileId: string;
  onClose: () => void;
}) {
  const data = useStore((s) => s.data)!;
  const navigate = useNavigate();
  const [b, setB] = useState<Binding>(initial ?? blankBinding());
  const [pid, setPid] = useState(profileId);
  const isNew = !data.profiles.some((p) => p.bindings.some((x) => x.id === initial?.id));

  useEffect(() => {
    if (open) {
      setB(initial ?? blankBinding());
      setPid(profileId);
    }
  }, [open, initial, profileId]);

  const profile = data.profiles.find((p) => p.id === pid) ?? data.profiles[0]!;
  const clash = conflicts(profile, b);
  const s = data.settings;
  const hotkeyClash =
    b.trigger.input !== 0 &&
    [s.masterHotkey, s.panicHotkey].some((h) => h.input === b.trigger.input && h.mods === b.trigger.mods);
  const modes = MODES[b.action.type];
  const mode = modes.includes(b.trigger.mode) ? b.trigger.mode : modes[0]!;
  const missingOutput =
    (b.action.type === "remap" || b.action.type === "rapid" || b.action.type === "holdLock") && !b.action.output;
  const missingMacro = b.action.type === "macro" && !data.macros.some((m) => m.id === (b.action as { macroId: string }).macroId);
  const canSave = b.trigger.input !== 0 && !missingOutput && !missingMacro;

  // Conditions only apply to things that run over time.
  const canCondition = b.action.type === "rapid" || b.action.type === "macro";
  const raw = b.conditions ?? NO_CONDITIONS;
  const conditions: Conditions = canCondition
    ? { ...raw, whileHeld: raw.whileHeld === b.trigger.input ? 0 : raw.whileHeld }
    : NO_CONDITIONS;
  const toggleKey = b.toggleKey ?? { input: 0, mods: 0 };
  const toggleProblem = !toggleKey.input
    ? null
    : toggleKey.input === b.trigger.input && toggleKey.mods === b.trigger.mods
      ? "That is this binding’s own trigger; pick a different key."
      : [s.masterHotkey, s.panicHotkey].some((h) => h.input === toggleKey.input && h.mods === toggleKey.mods)
        ? "That is a MacroForge hotkey (Settings); pick a different key."
        : profile.bindings.some((o) => o.id !== b.id && o.enabled && o.trigger.input === toggleKey.input && o.trigger.mods === toggleKey.mods)
          ? `${comboName(toggleKey.input, toggleKey.mods)} also starts another binding in ${profile.name}; the on / off key wins.`
          : null;
  const aimSwallowed =
    conditions.whileHeld !== 0 &&
    profile.bindings.some((o) => o.id !== b.id && o.enabled && o.trigger.input === conditions.whileHeld && !o.trigger.passthrough);

  const setAction = (a: Action) => setB((x) => ({ ...x, action: a }));
  const patch = (p: Partial<Action>) => setB((x) => ({ ...x, action: { ...x.action, ...p } as Action }));

  const save = () => {
    const final: Binding = { ...b, trigger: { ...b.trigger, mode }, conditions, toggleKey: toggleKey.input === b.trigger.input ? { input: 0, mods: 0 } : toggleKey };
    update((d: Data) => ({
      ...d,
      profiles: d.profiles.map((p) => {
        const without = p.bindings.filter((x) => x.id !== final.id);
        if (p.id !== pid) return { ...p, bindings: without };
        const idx = p.bindings.findIndex((x) => x.id === final.id);
        if (idx < 0) return { ...p, bindings: [...without, final] };
        const next = [...p.bindings];
        next[idx] = final;
        return { ...p, bindings: next };
      }),
    }));
    toast(isNew ? "Binding added" : "Binding saved");
    onClose();
  };

  const newMacro = () => {
    const m: Macro = { id: newId("m"), name: "New macro", steps: [] };
    update((d) => ({ ...d, macros: [...d.macros, m] }));
    setAction({ type: "macro", macroId: m.id, repeat: 1, onRepress: "ignore", stopImmediately: true });
    return m;
  };

  return (
    <Dialog
      open={open}
      wide
      title={isNew ? "New binding" : "Edit binding"}
      onClose={onClose}
      footer={
        <>
          {!canSave && (
            <span className="mr-auto text-xs text-ink-muted">
              {b.trigger.input === 0 ? "Set the key that starts it." : missingMacro ? "Choose a macro." : "Choose what it sends."}
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {isNew ? "Add binding" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7 text-ink">
        {/* ------------------------------------------------ When I … */}
        <section>
          <StepLabel n={1}>When I…</StepLabel>
          <KeyField
            size="lg"
            label="Trigger"
            value={{ input: b.trigger.input, mods: b.trigger.mods }}
            onChange={(v) => setB((x) => ({ ...x, trigger: { ...x.trigger, ...v } }))}
          />
          {modes.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Segmented
                label="Mode"
                value={mode}
                onChange={(m) => setB((x) => ({ ...x, trigger: { ...x.trigger, mode: m } }))}
                options={modes.map((m) => ({ value: m, label: MODE_TEXT[m].label }))}
              />
              <span className="text-xs text-ink-muted">{MODE_TEXT[mode].hint}</span>
            </div>
          )}
          <label className="mt-4 flex items-center gap-3 text-sm">
            <Switch
              label="Let the game see this key too"
              checked={b.trigger.passthrough}
              onChange={(v) => setB((x) => ({ ...x, trigger: { ...x.trigger, passthrough: v } }))}
            />
            <span>
              <span className="font-bold">Let the game see this key too</span>
              <span className="block text-xs text-ink-muted">Off: only what the binding sends reaches the game.</span>
            </span>
          </label>
          {clash.length > 0 && (
            <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-violet-soft">
              <TriangleAlert aria-hidden className="size-4" />
              {comboName(b.trigger.input, b.trigger.mods)} is already used in {profile.name}; the first one listed wins.
            </p>
          )}
          {hotkeyClash && (
            <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-bad">
              <TriangleAlert aria-hidden className="size-4" />
              That is a MacroForge hotkey (Settings), so this binding would never run.
            </p>
          )}
        </section>

        {/* ------------------------------------------------ … do this */}
        <section>
          <StepLabel n={2}>…do this</StepLabel>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(ACTION_TEXT) as ActionType[]).map((t) => {
              const Icon = ACTION_ICON[t];
              const on = b.action.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => !on && setAction(defaultAction(t, b, data.macros))}
                  className={cx(
                    "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors",
                    on ? "border-violet bg-violet/15" : "border-line bg-surface-2 hover:border-line-strong",
                  )}
                >
                  <Icon aria-hidden className={cx("size-5", on ? "text-lime" : "text-ink-muted")} />
                  <span className="text-sm font-bold">{ACTION_TEXT[t].label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-muted">{ACTION_TEXT[b.action.type].hint}</p>

          <div className="mt-5 rounded-xl border border-line bg-surface-0/40 p-4">
            {b.action.type === "macro" && (
              <MacroOptions
                action={b.action}
                macros={data.macros}
                mode={mode}
                onChange={(p) => patch(p)}
                onNew={newMacro}
                onOpen={(id) => {
                  save();
                  navigate({ view: "macros", focus: id });
                }}
                canSaveFirst={canSave}
              />
            )}
            {b.action.type === "rapid" && <RapidOptions action={b.action} onChange={(p) => patch(p)} />}
            {b.action.type === "remap" && (
              <Field label="Send instead">
                <KeyField label="Output" value={{ input: b.action.output, mods: b.action.mods }} onChange={(v) => patch({ output: v.input, mods: v.mods })} />
              </Field>
            )}
            {b.action.type === "holdLock" && (
              <Field label="Key to hold down" hint="Press the trigger again to let go. MacroForge also lets go if you switch away from the game or press Stop all.">
                <KeyField label="Held key" withMods={false} value={{ input: b.action.output, mods: 0 }} onChange={(v) => patch({ output: v.input })} />
              </Field>
            )}
            {b.action.type === "block" && (
              <p className="text-sm text-ink-muted">
                {b.trigger.input ? keyName(b.trigger.input) : "The key"} will do nothing while this binding is active. Common use: the Windows key in games.
              </p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ only when… */}
        {canCondition && (
          <section>
            <StepLabel n={3}>
              Only when…
              <span className="ml-2 text-xs font-semibold tracking-normal text-ink-faint">optional</span>
            </StepLabel>
            <ConditionsEditor
              value={conditions}
              onChange={(c) => setB((x) => ({ ...x, conditions: c }))}
              trigger={b.trigger.input}
              action={b.action}
              mode={mode}
            />
            {aimSwallowed && (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-violet-soft">
                <TriangleAlert aria-hidden className="size-4" />
                {keyName(conditions.whileHeld)} is also a trigger in {profile.name} that hides it from the game, so the game would not see you aim.
              </p>
            )}
          </section>
        )}

        {/* ------------------------------------------------ own on / off key */}
        <section>
          <StepLabel n={canCondition ? 4 : 3}>
            On / off key
            <span className="ml-2 text-xs font-semibold tracking-normal text-ink-faint">optional</span>
          </StepLabel>
          <div className={cx("rounded-xl border p-4", toggleKey.input ? "border-violet/50 bg-violet/[0.06]" : "border-line bg-surface-2")}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-extrabold tracking-tight">Turn just this binding off and on</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Press it in game to switch this one off while everything else keeps working; press again to switch it back on. A notice shows which way it went.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <KeyField
                  label="On / off key"
                  value={toggleKey}
                  quick={[]}
                  onChange={(v) => {
                    if (v.input === MOUSE_LEFT || v.input === 257) {
                      toast("Left and right click can’t be an on / off key: every click would toggle it.");
                      return;
                    }
                    setB((x) => ({ ...x, toggleKey: v }));
                  }}
                />
                {toggleKey.input !== 0 && (
                  <button type="button" className="text-xs font-bold text-ink-muted hover:text-ink" onClick={() => setB((x) => ({ ...x, toggleKey: { input: 0, mods: 0 } }))}>
                    Remove on / off key
                  </button>
                )}
              </div>
            </div>
            {toggleProblem && (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-violet-soft">
                <TriangleAlert aria-hidden className="size-4" /> {toggleProblem}
              </p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ name, profile */}
        <section className="grid grid-cols-2 gap-4">
          <Field label="Name (optional)">
            <TextInput label="Name" value={b.name} onChange={(name) => setB((x) => ({ ...x, name: name.slice(0, 60) }))} placeholder="e.g. Auto-loot" />
          </Field>
          <Field label="Profile" hint={profile.apps.length ? `Only while ${profile.apps.join(", ")} is in front.` : "Works everywhere."}>
            <Select label="Profile" value={pid} onChange={setPid} options={data.profiles.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        </section>
      </div>
    </Dialog>
  );
}

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2.5 text-base font-extrabold tracking-tight">
      <span className="grid size-6 place-items-center rounded-md bg-violet text-xs text-on-accent">{n}</span>
      {children}
    </p>
  );
}

function RapidOptions({ action, onChange }: { action: Extract<Action, { type: "rapid" }>; onChange: (p: Partial<Action>) => void }) {
  const period = 1000 / action.rate;
  return (
    <div className="flex flex-col gap-5">
      <Field label="Send">
        <KeyField label="Rapid output" withMods={false} value={{ input: action.output, mods: 0 }} onChange={(v) => onChange({ output: v.input })} />
      </Field>
      <Field label="Speed">
        <div className="flex items-center gap-4">
          <Slider label="Presses per second" min={1} max={50} step={0.5} value={action.rate} onChange={(rate) => onChange({ rate })} />
          <NumberField label="Presses per second" min={0.1} max={1000} step={1} value={action.rate} onChange={(rate) => onChange({ rate })} suffix="/ s" />
        </div>
        <span className="text-xs text-ink-muted">
          One press every {period >= 1000 ? `${(period / 1000).toFixed(2)} s` : `${period.toFixed(1)} ms`} ({fmtRate(action.rate)} per second).
        </span>
      </Field>
      <FireRateHelper rate={action.rate} onRate={(rate) => onChange({ rate })} holdMs={action.holdMs} onAutoHold={() => onChange({ holdMs: 0 })} />
      <div className="grid grid-cols-2 gap-5">
        <Field
          label="Press length"
          hint={
            action.holdMs > 0
              ? "Games that read input once a frame can miss presses shorter than a frame, more so when busy. Auto avoids that."
              : `Down ${(period / 2).toFixed(1)} ms, up ${(period / 2).toFixed(1)} ms: an even split, so neither half is short enough for a busy game to miss.`
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              size="sm"
              label="Press length"
              value={action.holdMs > 0 ? "custom" : "auto"}
              onChange={(v) => onChange({ holdMs: v === "auto" ? 0 : Math.round(Math.min(30, period * 0.5)) })}
              options={[
                { value: "auto", label: "Auto (half)" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {action.holdMs > 0 && (
              <NumberField label="Press length" min={1} max={5000} value={action.holdMs} onChange={(holdMs) => onChange({ holdMs })} suffix="ms" width="w-20" />
            )}
          </div>
        </Field>
        <Field label="Timing variation" hint="Adds up to this much to each gap, at random, so the rhythm is not perfectly even. It never makes a gap shorter, so the rate never goes over what you set.">
          <NumberField label="Timing variation" min={0} max={50} value={action.jitterPct} onChange={(jitterPct) => onChange({ jitterPct })} suffix="%" />
        </Field>
      </div>
    </div>
  );
}

function MacroOptions({
  action,
  macros,
  mode,
  onChange,
  onNew,
  onOpen,
  canSaveFirst,
}: {
  action: Extract<Action, { type: "macro" }>;
  macros: Macro[];
  mode: TriggerMode;
  onChange: (p: Partial<Action>) => void;
  onNew: () => Macro;
  onOpen: (id: string) => void;
  canSaveFirst: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Macro">
        <div className="flex items-center gap-2">
          {macros.length > 0 ? (
            <Select
              label="Macro"
              className="min-w-64"
              value={action.macroId}
              onChange={(macroId) => onChange({ macroId })}
              options={[...(macros.some((m) => m.id === action.macroId) ? [] : [{ value: "", label: "Choose a macro" }]), ...macros.map((m) => ({ value: m.id, label: `${m.name} (${m.steps.length} steps)` }))]}
            />
          ) : (
            <span className="text-sm text-ink-muted">No macros yet.</span>
          )}
          <Button size="sm" icon={<Plus aria-hidden className="size-3.5" />} onClick={() => onNew()}>
            New macro
          </Button>
          {canSaveFirst && macros.some((m) => m.id === action.macroId) && (
            <Button size="sm" variant="ghost" onClick={() => onOpen(action.macroId)}>
              Save and edit steps
            </Button>
          )}
        </div>
      </Field>
      {mode === "press" ? (
        <div className="grid grid-cols-2 gap-5">
          <Field label="Play it" hint="Times per press.">
            <NumberField label="Repeat" min={1} max={100000} value={action.repeat} onChange={(repeat) => onChange({ repeat })} suffix="×" />
          </Field>
          <Field label="Pressed again while playing">
            <Segmented
              size="sm"
              label="Pressed again while playing"
              value={action.onRepress}
              onChange={(onRepress) => onChange({ onRepress })}
              options={[
                { value: "ignore", label: "Ignore" },
                { value: "restart", label: "Restart" },
                { value: "stop", label: "Stop" },
              ]}
            />
          </Field>
        </div>
      ) : (
        <Field label="When it stops" hint={mode === "hold" ? "When you let go." : "When you press it again."}>
          <Segmented
            size="sm"
            label="When it stops"
            value={action.stopImmediately ? "now" : "finish"}
            onChange={(v) => onChange({ stopImmediately: v === "now" })}
            options={[
              { value: "now", label: "Stop right away" },
              { value: "finish", label: "Finish the current pass" },
            ]}
          />
        </Field>
      )}
      {macros.length === 0 && (
        <Callout tone="info" title="Make a macro first">
          Click New macro, then record or build its steps in Macros.
        </Callout>
      )}
    </div>
  );
}

export function DeleteBindingButton({ onDelete }: { onDelete: () => void }) {
  return (
    <Button variant="danger" size="sm" icon={<Trash2 aria-hidden className="size-3.5" />} onClick={onDelete}>
      Delete
    </Button>
  );
}
