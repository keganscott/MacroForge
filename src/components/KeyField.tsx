// Setting a key: click Assign, then press it (captured by the engine's hook,
// so mouse buttons, Print Screen and media keys all work, left and right
// click included), or pick it from the list. Esc cancels.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Keyboard, MousePointerClick, Search } from "lucide-react";

import { KEY_GROUPS, MODS, keyName, MOUSE_LEFT, MOUSE_RIGHT } from "../lib/keys";
import { backend } from "../store";
import { cx, Keycap } from "./ui";

export interface KeyValue {
  input: number;
  mods: number;
}

export function KeyField({
  value,
  onChange,
  withMods = true,
  label,
  quick = [MOUSE_LEFT, MOUSE_RIGHT],
  size = "md",
}: {
  value: KeyValue;
  onChange: (v: KeyValue) => void;
  /** Record held modifiers with the key (triggers, remap outputs). */
  withMods?: boolean;
  label: string;
  /** One-click choices shown next to the field. */
  quick?: number[];
  size?: "md" | "lg";
}) {
  const [capturing, setCapturing] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const capture = async () => {
    setListOpen(false);
    setCapturing(true);
    document.body.dataset.capturing = "1";
    try {
      const got = await backend().captureInput(10_000);
      if (alive.current && got && got.input) onChange({ input: got.input, mods: withMods ? got.mods : 0 });
    } finally {
      delete document.body.dataset.capturing;
      if (alive.current) setCapturing(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {capturing ? (
          // Listening: the next key or mouse button (left / right click too)
          // is assigned, so there is nothing here to click; Esc cancels.
          <div
            role="status"
            aria-live="polite"
            className={cx(
              "flex items-center gap-3 rounded-xl border border-lime bg-lime/10 px-4 shadow-[0_0_24px_-6px_var(--color-lime)]",
              size === "lg" ? "min-h-14 min-w-72" : "min-h-11 min-w-56",
            )}
          >
            <span aria-hidden className="live-dot size-2.5 rounded-full bg-lime" />
            <span className="text-sm font-bold text-lime">Press any key or mouse button</span>
            <span className="ml-auto rounded-md border border-lime/40 px-1.5 py-0.5 font-mono text-[10px] font-bold text-lime">Esc cancels</span>
          </div>
        ) : (
          <div
            className={cx(
              "flex items-center gap-3 rounded-xl border border-line-strong bg-surface-2 pr-1.5 pl-3",
              size === "lg" ? "min-h-14 min-w-72" : "min-h-11 min-w-56",
            )}
          >
            <Keycap input={value.input} mods={value.mods} empty="Not set" />
            <button
              type="button"
              onClick={capture}
              aria-label={`${label}: assign. Click, then press the key or mouse button you want`}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet px-3 text-xs font-bold text-on-accent hover:bg-violet-strong"
            >
              <Keyboard aria-hidden className="size-3.5" />
              {value.input ? "Reassign" : "Assign"}
            </button>
          </div>
        )}
        {capturing ? (
          <span className="text-xs text-ink-muted">The very next press is assigned, including left or right click.</span>
        ) : (
          <>
            {quick.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onChange({ input: q, mods: 0 })}
                className={cx(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold",
                  value.input === q && !value.mods ? "border-violet bg-violet/15 text-ink" : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <MousePointerClick aria-hidden className="size-3.5" />
                {keyName(q)}
              </button>
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setListOpen((o) => !o)}
                aria-expanded={listOpen}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-bold text-ink-muted hover:border-line-strong hover:text-ink"
              >
                All keys <ChevronDown aria-hidden className="size-3.5" />
              </button>
              {listOpen && (
                <KeyList
                  onPick={(input) => {
                    onChange({ input, mods: value.mods });
                    setListOpen(false);
                  }}
                  onClose={() => setListOpen(false)}
                />
              )}
            </div>
          </>
        )}
      </div>
      {withMods && !capturing && value.input !== 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-ink-faint">With</span>
          {MODS.map((m) => {
            const on = (value.mods & m.bit) !== 0;
            return (
              <button
                key={m.bit}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, mods: value.mods ^ m.bit })}
                className={cx(
                  "h-7 rounded-md border px-2 text-xs font-bold",
                  on ? "border-violet bg-violet text-on-accent" : "border-line text-ink-muted hover:text-ink",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KeyList({ onPick, onClose }: { onPick: (input: number) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  const needle = q.trim().toLowerCase();
  return (
    <div ref={ref} className="absolute top-10 left-0 z-40 w-80 rounded-xl border border-line-strong bg-surface-1 p-2 shadow-2xl shadow-black">
      <label className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-2.5">
        <Search aria-hidden className="size-4 text-ink-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search keys"
          aria-label="Search keys"
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
      </label>
      <div className="scrollbar-quiet max-h-72 overflow-y-auto pr-1">
        {KEY_GROUPS.map((g) => {
          const codes = g.codes.filter((c) => !needle || keyName(c).toLowerCase().includes(needle));
          if (!codes.length) return null;
          return (
            <div key={g.label} className="mb-2">
              <p className="px-1 pb-1 text-[10px] font-bold tracking-[0.12em] text-ink-faint uppercase">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {codes.map((c) => (
                  <button key={c} type="button" onClick={() => onPick(c)} className="keycap cursor-pointer hover:border-violet">
                    {keyName(c)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
