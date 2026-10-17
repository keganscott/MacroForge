// Setting a key: press it (captured by the engine's hook, so Mouse 4/5,
// Print Screen and media keys all work), or pick it from the list. Left and
// right click are always picked, since clicking is how you use the app.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Keyboard, MousePointerClick, Search, X } from "lucide-react";

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

  const cancel = () => void backend().cancelCapture();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={capturing ? cancel : capture}
          aria-label={capturing ? `${label}: press a key, or click to cancel` : `${label}: ${value.input ? keyName(value.input) : "not set"}. Click, then press a key`}
          className={cx(
            "group flex items-center gap-3 rounded-xl border px-3 text-left transition-colors",
            size === "lg" ? "min-h-14 min-w-64" : "min-h-11 min-w-44",
            capturing ? "border-lime bg-lime/5" : "border-line-strong bg-surface-2 hover:border-violet",
          )}
        >
          {capturing ? (
            <span className="flex items-center gap-2 text-sm font-bold text-lime">
              <Keyboard aria-hidden className="size-4 animate-pulse" />
              Press any key or mouse button…
            </span>
          ) : (
            <>
              <Keycap input={value.input} mods={value.mods} empty="Click to set" />
              <span className="ml-auto pl-2 text-xs font-semibold text-ink-faint group-hover:text-ink-muted">Change</span>
            </>
          )}
        </button>
        {capturing ? (
          <button type="button" onClick={cancel} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-ink-muted hover:bg-surface-2 hover:text-ink">
            <X aria-hidden className="size-3.5" /> Cancel (Esc)
          </button>
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
