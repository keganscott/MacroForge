import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Circle,
  Clock,
  Copy,
  GripVertical,
  Keyboard,
  ListVideo,
  MousePointer2,
  MousePointerClick,
  Move,
  Play,
  Plus,
  Search,
  Square,
  Trash2,
  Type,
} from "lucide-react";

import { KeyField } from "../components/KeyField";
import { MacroTimeline } from "../components/Timeline";
import { useNavigate } from "../components/Shell";
import { Button, Card, cx, Dialog, Empty, Eyebrow, IconButton, Keycap, LiveDot, NumberField, PageHeader, Segmented, Switch, TextInput } from "../components/ui";
import { fmtMs, macroDuration, macroUsers, newId, stepSummary } from "../lib/describe";
import { MOUSE_LEFT } from "../lib/keys";
import type { Macro, Step, StepType } from "../lib/types";
import { backend, setSettings, toast, update, useStore } from "../store";

const STEP_KINDS: { type: StepType; label: string; Icon: typeof Keyboard; make: () => Step }[] = [
  { type: "press", label: "Key / click", Icon: Keyboard, make: () => ({ type: "press", input: 0, holdMs: 20 }) },
  { type: "delay", label: "Wait", Icon: Clock, make: () => ({ type: "delay", ms: 50, jitterMs: 0 }) },
  { type: "down", label: "Hold down", Icon: ArrowDown, make: () => ({ type: "down", input: 0 }) },
  { type: "up", label: "Release", Icon: ArrowUp, make: () => ({ type: "up", input: 0 }) },
  { type: "text", label: "Type text", Icon: Type, make: () => ({ type: "text", text: "", charDelayMs: 10 }) },
  { type: "wheel", label: "Scroll", Icon: MousePointerClick, make: () => ({ type: "wheel", delta: 1, horizontal: false }) },
  { type: "move", label: "Move mouse", Icon: Move, make: () => ({ type: "move", dx: 0, dy: 0, durationMs: 0 }) },
  { type: "moveTo", label: "Cursor to", Icon: MousePointer2, make: () => ({ type: "moveTo", x: 0, y: 0 }) },
];
const KIND = Object.fromEntries(STEP_KINDS.map((k) => [k.type, k])) as Record<StepType, (typeof STEP_KINDS)[number]>;

export function MacrosView({ focus }: { focus?: string }) {
  const macros = useStore((s) => s.data!.macros);
  const [sel, setSel] = useState<string | null>(focus ?? macros[0]?.id ?? null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (focus) setSel(focus);
  }, [focus]);
  useEffect(() => {
    if (sel && !macros.some((m) => m.id === sel)) setSel(macros[0]?.id ?? null);
  }, [macros, sel]);
  const macro = macros.find((m) => m.id === sel) ?? null;

  const create = () => {
    const m: Macro = { id: newId("m"), name: `Macro ${macros.length + 1}`, steps: [] };
    update((d) => ({ ...d, macros: [...d.macros, m] }));
    setSel(m.id);
  };

  const needle = q.trim().toLowerCase();
  return (
    <>
      <PageHeader
        title="Macros"
        description="Sequences of keys, clicks, waits and text. Record one or build it step by step, then give it a key in Bindings."
        actions={
          <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={create}>
            New macro
          </Button>
        }
      />
      {macros.length === 0 ? (
        <Empty
          icon={<ListVideo aria-hidden className="size-6" />}
          title="No macros yet"
          action={
            <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={create}>
              New macro
            </Button>
          }
        >
          A macro can press keys, click, wait, scroll, move the mouse and type text, with timing down to the millisecond.
        </Empty>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-6">
          <div className="flex flex-col gap-2">
            {macros.length > 6 && (
              <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-3">
                <Search aria-hidden className="size-4 text-ink-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a macro" aria-label="Find a macro" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint" />
              </label>
            )}
            {macros
              .filter((m) => !needle || m.name.toLowerCase().includes(needle))
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSel(m.id)}
                  aria-current={m.id === sel || undefined}
                  className={cx(
                    "rounded-xl border p-3 text-left transition-colors",
                    m.id === sel ? "border-violet bg-violet/10" : "border-line bg-surface-1 hover:border-line-strong",
                  )}
                >
                  <span className="block truncate text-sm font-bold">{m.name}</span>
                  <span className="text-xs text-ink-muted">
                    {m.steps.length} steps · {fmtMs(macroDuration(m.steps))}
                  </span>
                </button>
              ))}
          </div>
          {macro && <MacroEditor key={macro.id} macro={macro} />}
        </div>
      )}
    </>
  );
}

function MacroEditor({ macro }: { macro: Macro }) {
  const data = useStore((s) => s.data)!;
  const running = useStore((s) => s.status?.running.some((r) => r.id === `play:${macro.id}`) ?? false);
  const recordingLive = useStore((s) => s.status?.recording ?? false);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recCount, setRecCount] = useState(0);
  const [recOpen, setRecOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const users = macroUsers(data, macro.id);

  const set = (fn: (m: Macro) => Macro) => update((d) => ({ ...d, macros: d.macros.map((m) => (m.id === macro.id ? fn(m) : m)) }));
  const setSteps = (fn: (s: Step[]) => Step[]) => set((m) => ({ ...m, steps: fn(m.steps) }));

  const insert = (steps: Step[]) => {
    const at = selected === null ? macro.steps.length : selected + 1;
    setSteps((s) => [...s.slice(0, at), ...steps, ...s.slice(at)]);
    setSelected(at + steps.length - 1);
  };

  useEffect(() => {
    if (!recording) return;
    return backend().onRecorded(setRecCount);
  }, [recording]);

  const startRecording = async () => {
    setRecOpen(false);
    setRecCount(0);
    await backend().recordStart();
    setRecording(true);
  };
  const stopRecording = async () => {
    const steps = await backend().recordStop();
    setRecording(false);
    if (steps.length) {
      insert(steps);
      toast(`Recorded ${steps.length} steps`);
    } else toast("Nothing was recorded");
  };

  const play = () => {
    // 3-2-1 so you can switch to the window it should type into.
    let n = 3;
    setCountdown(n);
    const tick = setInterval(() => {
      n -= 1;
      if (n > 0) setCountdown(n);
      else {
        clearInterval(tick);
        setCountdown(null);
        void backend().playSteps(macro.id, macro.name, macro.steps);
      }
    }, 1000);
    cancelCountdown.current = () => {
      clearInterval(tick);
      setCountdown(null);
    };
  };
  const cancelCountdown = useRef<() => void>(() => {});

  const del = () => {
    const before = data.macros;
    update((d) => ({ ...d, macros: d.macros.filter((m) => m.id !== macro.id) }));
    toast(`Deleted ${macro.name}`, () => update((d) => ({ ...d, macros: before })));
  };

  const duplicate = () => {
    const copy = { ...structuredClone(macro), id: newId("m"), name: `${macro.name} copy` };
    update((d) => ({ ...d, macros: [...d.macros, copy] }));
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= macro.steps.length) return;
    setSteps((s) => {
      const next = [...s];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x!);
      return next;
    });
    setSelected(to);
  };

  return (
    <div className="min-w-0">
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Macro name"
            value={macro.name}
            onChange={(e) => set((m) => ({ ...m, name: e.target.value.slice(0, 60) }))}
            className="min-w-0 flex-1 rounded-lg bg-transparent px-1 text-xl font-extrabold tracking-tight outline-none focus:bg-surface-2"
          />
          <IconButton label="Duplicate macro" onClick={duplicate}>
            <Copy aria-hidden className="size-4" />
          </IconButton>
          <IconButton label="Delete macro" onClick={del} className="hover:text-bad">
            <Trash2 aria-hidden className="size-4" />
          </IconButton>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-ink-muted">
          <span>{macro.steps.length} steps</span>
          <span>About {fmtMs(macroDuration(macro.steps))} per pass</span>
          {users.length ? (
            <span>
              Used by{" "}
              {users.map((u, i) => (
                <button key={u.binding.id} type="button" className="font-bold text-ink hover:underline" onClick={() => navigate({ view: "bindings", focus: u.profile.id })}>
                  {i > 0 && ", "}
                  {u.binding.name || u.profile.name}
                </button>
              ))}
            </span>
          ) : (
            <button type="button" className="font-bold text-violet-soft hover:underline" onClick={() => navigate({ view: "bindings" })}>
              Not on a key yet: add a binding
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {recording ? (
            <Button variant="danger" icon={<Square aria-hidden className="size-4" />} onClick={() => void stopRecording()}>
              Stop recording · {recCount} events
            </Button>
          ) : (
            <Button icon={<Circle aria-hidden className="size-4 fill-bad text-bad" />} onClick={() => setRecOpen(true)} disabled={recordingLive}>
              Record
            </Button>
          )}
          {countdown !== null ? (
            <Button variant="go" onClick={() => cancelCountdown.current()}>
              Playing in {countdown}… (cancel)
            </Button>
          ) : running ? (
            <Button variant="danger" icon={<Square aria-hidden className="size-4" />} onClick={() => void backend().stopRun(macro.id)}>
              Stop
            </Button>
          ) : (
            <Button variant="go" icon={<Play aria-hidden className="size-4" />} disabled={macro.steps.length === 0 || recording} onClick={play}>
              Test play
            </Button>
          )}
          {recording && (
            <span className="flex items-center gap-2 text-xs text-ink-muted">
              <LiveDot className="bg-bad" /> Recording in other apps; switch to your game or app now. Input in this window is not recorded.
            </span>
          )}
          {running && (
            <span className="flex items-center gap-2 text-xs font-bold text-lime">
              <LiveDot /> Playing
            </span>
          )}
        </div>
      </Card>

      <MacroTimeline steps={macro.steps} selected={selected} onSelect={setSelected} playing={running} />

      {/* ------------------------------------------------ add-step bar */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Eyebrow className="mr-2">Add</Eyebrow>
        {STEP_KINDS.map((k) => (
          <button
            key={k.type}
            type="button"
            onClick={() => insert([k.make()])}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-1 px-2.5 text-xs font-bold text-ink-muted hover:border-violet hover:text-ink"
          >
            <k.Icon aria-hidden className="size-3.5" />
            {k.label}
          </button>
        ))}
        {selected !== null && <span className="ml-2 text-xs text-ink-faint">after step {selected + 1}</span>}
      </div>

      {macro.steps.length === 0 ? (
        <Empty icon={<ListVideo aria-hidden className="size-6" />} title="This macro is empty">
          Add steps with the buttons above, or press Record and do it once yourself.
        </Empty>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {macro.steps.map((s, i) => (
            <li
              key={i}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              onClick={() => setSelected(i)}
              className={cx(
                "group flex items-center gap-3 rounded-xl border bg-surface-1 px-3 py-2",
                selected === i ? "border-violet" : "border-line",
                dragOver === i && dragFrom !== null && dragFrom !== i && "border-lime",
                dragFrom === i && "opacity-40",
              )}
            >
              <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-ink-faint" />
              <span className="w-7 shrink-0 text-right font-mono text-xs text-ink-faint">{i + 1}</span>
              <StepIcon type={s.type} />
              <div className="min-w-0 flex-1">
                <StepFields step={s} onChange={(n) => setSteps((all) => all.map((x, j) => (j === i ? n : x)))} />
              </div>
              <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUp aria-hidden className="size-4" />
                </IconButton>
                <IconButton label="Move down" disabled={i === macro.steps.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDown aria-hidden className="size-4" />
                </IconButton>
                <IconButton label="Duplicate step" onClick={() => setSteps((all) => [...all.slice(0, i + 1), structuredClone(s), ...all.slice(i + 1)])}>
                  <Copy aria-hidden className="size-4" />
                </IconButton>
                <IconButton
                  label="Delete step"
                  className="hover:text-bad"
                  onClick={() => {
                    setSteps((all) => all.filter((_, j) => j !== i));
                    setSelected(null);
                  }}
                >
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
      )}

      <RecordDialog open={recOpen} onClose={() => setRecOpen(false)} onStart={() => void startRecording()} />
    </div>
  );
}

function StepIcon({ type }: { type: StepType }) {
  const { Icon } = KIND[type];
  return (
    <span className={cx("grid size-8 shrink-0 place-items-center rounded-lg", type === "delay" ? "bg-surface-3 text-ink-muted" : "bg-violet/20 text-violet-soft")}>
      <Icon aria-hidden className="size-4" />
    </span>
  );
}

/** Inline fields for one step. */
function StepFields({ step, onChange }: { step: Step; onChange: (s: Step) => void }) {
  const [keyOpen, setKeyOpen] = useState(false);
  switch (step.type) {
    case "press":
    case "down":
    case "up": {
      const verb = step.type === "press" ? "Press" : step.type === "down" ? "Hold down" : "Release";
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-xs font-bold text-ink-muted">{verb}</span>
          <button type="button" onClick={() => setKeyOpen(true)} className="rounded-md hover:ring-2 hover:ring-violet/60">
            <Keycap input={step.input} empty="Choose key" />
          </button>
          {step.type === "press" && (
            <>
              <span className="text-xs text-ink-faint">held</span>
              <NumberField label="Hold time" min={0} max={60000} value={step.holdMs} onChange={(holdMs) => onChange({ ...step, holdMs })} suffix="ms" width="w-20" />
            </>
          )}
          <Dialog open={keyOpen} title={`${verb}: which key?`} onClose={() => setKeyOpen(false)} footer={<Button variant="primary" onClick={() => setKeyOpen(false)}>Done</Button>}>
            <KeyField
              label="Step key"
              withMods={false}
              value={{ input: step.input, mods: 0 }}
              quick={[MOUSE_LEFT, 257, 258]}
              onChange={(v) => {
                onChange({ ...step, input: v.input });
                setKeyOpen(false);
              }}
            />
            <p className="mt-4 text-xs">To press a combination like Ctrl + C, use Hold down Ctrl, Press C, Release Ctrl.</p>
          </Dialog>
        </div>
      );
    }
    case "delay":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-xs font-bold text-ink-muted">Wait</span>
          <NumberField label="Wait" min={0} max={3600000} value={step.ms} onChange={(ms) => onChange({ ...step, ms, jitterMs: Math.min(step.jitterMs, ms) })} suffix="ms" />
          <span className="text-xs text-ink-faint">±</span>
          <NumberField label="Random variation" min={0} max={step.ms} value={step.jitterMs} onChange={(jitterMs) => onChange({ ...step, jitterMs })} suffix="ms" width="w-20" />
        </div>
      );
    case "text":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-xs font-bold text-ink-muted">Type</span>
          <TextInput label="Text" value={step.text} onChange={(text) => onChange({ ...step, text: text.slice(0, 4000) })} placeholder="Text to type" className="h-9 min-w-48 flex-1" />
          <NumberField label="Delay between characters" min={0} max={10000} value={step.charDelayMs} onChange={(charDelayMs) => onChange({ ...step, charDelayMs })} suffix="ms / char" width="w-16" />
        </div>
      );
    case "wheel":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-xs font-bold text-ink-muted">Scroll</span>
          <Segmented
            size="sm"
            label="Direction"
            value={step.horizontal ? (step.delta > 0 ? "right" : "left") : step.delta > 0 ? "up" : "down"}
            onChange={(d) => onChange({ ...step, horizontal: d === "left" || d === "right", delta: Math.abs(step.delta) * (d === "up" || d === "right" ? 1 : -1) })}
            options={[
              { value: "up", label: "Up" },
              { value: "down", label: "Down" },
              { value: "left", label: "Left" },
              { value: "right", label: "Right" },
            ]}
          />
          <NumberField label="Notches" min={1} max={100} value={Math.abs(step.delta)} onChange={(n) => onChange({ ...step, delta: Math.sign(step.delta || 1) * n })} suffix="notches" width="w-16" />
        </div>
      );
    case "move":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-xs font-bold text-ink-muted">Move by</span>
          <NumberField label="Horizontal" min={-200000} max={200000} value={step.dx} onChange={(dx) => onChange({ ...step, dx: Math.round(dx) })} suffix="x" width="w-24" />
          <NumberField label="Vertical" min={-200000} max={200000} value={step.dy} onChange={(dy) => onChange({ ...step, dy: Math.round(dy) })} suffix="y" width="w-24" />
          <span className="text-xs text-ink-faint">over</span>
          <NumberField label="Duration" min={0} max={60000} value={step.durationMs} onChange={(durationMs) => onChange({ ...step, durationMs })} suffix="ms" width="w-20" />
        </div>
      );
    case "moveTo":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-xs font-bold text-ink-muted">Cursor to</span>
          <NumberField label="X" min={-32000} max={32000} value={step.x} onChange={(x) => onChange({ ...step, x: Math.round(x) })} suffix="x" width="w-20" />
          <NumberField label="Y" min={-32000} max={32000} value={step.y} onChange={(y) => onChange({ ...step, y: Math.round(y) })} suffix="y" width="w-20" />
          <span className="text-xs text-ink-faint">{stepSummary(step)} (desktop pixels)</span>
        </div>
      );
  }
}

function RecordDialog({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: () => void }) {
  const s = useStore((st) => st.data!.settings);
  return (
    <Dialog
      open={open}
      title="Record a macro"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Circle aria-hidden className="size-3.5 fill-white" />} onClick={onStart}>
            Start recording
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 text-ink">
        <p className="text-ink-muted">
          Switch to your game or app and do the sequence once. Keys and mouse buttons are recorded; what you do in this window is not. Come back and press Stop. The steps are added after the selected step.
        </p>
        <div>
          <p className="mb-2 text-xs font-bold">Timing between steps</p>
          <Segmented
            label="Timing"
            value={s.recordTiming}
            onChange={(recordTiming) => setSettings({ recordTiming })}
            options={[
              { value: "real", label: "As I did it" },
              { value: "fixed", label: "Fixed gap" },
              { value: "none", label: "No waits" },
            ]}
          />
          {s.recordTiming === "fixed" && (
            <div className="mt-3">
              <NumberField label="Fixed gap" min={0} max={10000} value={s.recordFixedDelayMs} onChange={(recordFixedDelayMs) => setSettings({ recordFixedDelayMs })} suffix="ms between steps" />
            </div>
          )}
        </div>
        <label className="flex items-center gap-3">
          <Switch label="Record mouse movement" checked={s.recordMouseMoves} onChange={(recordMouseMoves) => setSettings({ recordMouseMoves })} />
          <span>
            <span className="text-sm font-bold">Record mouse movement</span>
            <span className="block text-xs text-ink-muted">Works on the desktop and in menus. A game that locks the cursor (most shooters) moves the camera another way, so its movement is not recorded accurately.</span>
          </span>
        </label>
      </div>
    </Dialog>
  );
}
