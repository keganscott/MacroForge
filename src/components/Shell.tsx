import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { Activity, Gamepad2, Gauge, Keyboard, LayoutGrid, ListVideo, OctagonX, Power, Settings as SettingsIcon, Wand2 } from "lucide-react";

import { comboName } from "../lib/keys";
import { backend, dismissToast, useStore } from "../store";
import { Logo } from "./brand";
import { cx, LiveDot, SampleBadge } from "./ui";

export type ViewId = "home" | "tools" | "presets" | "bindings" | "macros" | "performance" | "settings";

export const VIEWS: { id: ViewId; label: string; group: string; Icon: typeof LayoutGrid }[] = [
  { id: "home", label: "Home", group: "Overview", Icon: LayoutGrid },
  { id: "tools", label: "Quick tools", group: "Build", Icon: Wand2 },
  { id: "presets", label: "Game presets", group: "Build", Icon: Gamepad2 },
  { id: "bindings", label: "Bindings", group: "Build", Icon: Keyboard },
  { id: "macros", label: "Macros", group: "Build", Icon: ListVideo },
  { id: "performance", label: "Performance", group: "System", Icon: Gauge },
  { id: "settings", label: "Settings", group: "System", Icon: SettingsIcon },
];

export interface NavTarget {
  view: ViewId;
  /** e.g. a macro id to open in the Macros view. */
  focus?: string;
}

export const NavContext = createContext<(t: NavTarget) => void>(() => {});
export const useNavigate = () => useContext(NavContext);

export function Shell({ view, onNavigate, children }: { view: ViewId; onNavigate: (t: NavTarget) => void; children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [view]);
  // Selectors return primitives: a fresh object each call would re-render forever.
  const counts = {
    bindings: useStore((s) => s.data?.profiles.reduce((n, p) => n + p.bindings.length, 0) ?? 0),
    macros: useStore((s) => s.data?.macros.length ?? 0),
  };
  const running = useStore((s) => (s.status?.running.length ?? 0) + (s.status?.locks.length ?? 0));
  const groups = [...new Set(VIEWS.map((v) => v.group))];

  return (
    <NavContext.Provider value={onNavigate}>
      <div className="flex h-full">
        <nav aria-label="Main" className="scrollbar-quiet flex w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-black px-4 pt-6 pb-4">
          <div className="px-2">
            <Logo />
          </div>
          {groups.map((group) => (
            <div key={group} className="mt-8">
              <h2 className="px-2.5 pb-2 text-[10.5px] font-bold tracking-[0.14em] text-ink-faint uppercase">{group}</h2>
              <ul className="flex flex-col gap-1">
                {VIEWS.filter((v) => v.group === group).map(({ id, label, Icon }) => {
                  const active = id === view;
                  const n = id === "bindings" ? counts.bindings : id === "macros" ? counts.macros : id === "home" ? running : 0;
                  return (
                    <li key={id} className="relative">
                      {active && <span aria-hidden className="absolute top-2.5 bottom-2.5 -left-4 w-[3px] rounded-r-sm bg-violet" />}
                      <button
                        type="button"
                        onClick={() => onNavigate({ view: id })}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-sm font-semibold",
                          active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <Icon aria-hidden className={cx("size-[18px]", active && "text-lime")} strokeWidth={1.8} />
                        {label}
                        {n > 0 && (
                          <span
                            className={cx(
                              "ml-auto grid h-5 min-w-5 place-items-center rounded-md px-1.5 text-[11px] font-bold",
                              id === "home" ? "bg-lime text-black" : active ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted",
                            )}
                          >
                            {n}
                            <span className="sr-only">{id === "home" ? " running" : ""}</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="mt-auto pt-6">
            <EngineCard />
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main ref={main} className="scrollbar-quiet relative min-h-0 flex-1 overflow-y-auto px-9 pt-2 pb-10">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
      <Toast />
    </NavContext.Provider>
  );
}

/** Bottom of the sidebar: is the engine armed, and the two hotkeys. */
function EngineCard() {
  const status = useStore((s) => s.status);
  const settings = useStore((s) => s.data?.settings);
  if (!status || !settings) return null;
  const on = status.armed;
  return (
    <div className={cx("rounded-xl border p-3.5 texture-grid", on ? "border-lime/40" : "border-line")}>
      <p className="flex items-center gap-2 text-sm font-bold">
        {on ? <LiveDot /> : <span aria-hidden className="size-2 rounded-full bg-ink-faint" />}
        {on ? (status.pausedOwnWindow ? "On · paused here" : "Bindings on") : "Bindings off"}
      </p>
      <dl className="mt-2.5 space-y-1 text-xs text-ink-muted">
        {settings.masterHotkey.input !== 0 && (
          <div className="flex justify-between gap-2">
            <dt>On / off</dt>
            <dd className="font-mono text-ink">{comboName(settings.masterHotkey.input, settings.masterHotkey.mods)}</dd>
          </div>
        )}
        {settings.panicHotkey.input !== 0 && (
          <div className="flex justify-between gap-2">
            <dt>Stop all</dt>
            <dd className="font-mono text-ink">{comboName(settings.panicHotkey.input, settings.panicHotkey.mods)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function TopBar() {
  const status = useStore((s) => s.status);
  const sample = useStore((s) => s.sample);
  const saving = useStore((s) => s.saving);
  const saveError = useStore((s) => s.saveError);
  const profiles = useStore((s) => s.data?.profiles ?? []);
  if (!status) return null;
  const active = profiles.filter((p) => status.activeProfiles.includes(p.id) && p.apps.length > 0);
  const anything = status.running.length + status.locks.length > 0;
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 px-9">
      {sample && (
        <span className="flex items-center gap-2 text-xs font-bold text-sample">
          <SampleBadge /> Browser preview: nothing here touches your keyboard or mouse
        </span>
      )}
      <div className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
        <Activity aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">
          In front: <span className="font-mono text-ink">{status.pausedOwnWindow ? "MacroForge (bindings pause here)" : (status.foreground ?? "desktop")}</span>
          {active.length > 0 && (
            <>
              {" · "}
              <span className="font-bold text-lime">{active.map((p) => p.name).join(", ")}</span>
            </>
          )}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {saveError ? (
          <span className="text-xs font-bold text-bad" title={saveError}>
            Not saved
          </span>
        ) : saving ? (
          <span className="text-xs text-ink-faint">Saving…</span>
        ) : null}
        {anything && (
          <button
            type="button"
            onClick={() => void backend().panicStop()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-bad/40 bg-bad/10 px-3 text-xs font-bold text-bad hover:bg-bad/20"
          >
            <OctagonX aria-hidden className="size-4" /> Stop all
          </button>
        )}
        <MasterSwitch />
      </div>
    </div>
  );
}

export function MasterSwitch({ large = false }: { large?: boolean }) {
  const armed = useStore((s) => s.status?.armed ?? false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={armed}
      onClick={() => void backend().setArmed(!armed)}
      className={cx(
        "relative inline-flex items-center gap-2 overflow-hidden rounded-full border font-bold transition-colors",
        large ? "h-14 px-6 text-base" : "h-9 px-4 text-sm",
        armed ? "border-lime bg-lime text-black" : "border-line-strong bg-surface-2 text-ink-muted hover:text-ink",
      )}
    >
      <Power aria-hidden className={large ? "size-5" : "size-4"} strokeWidth={2.4} />
      {armed ? "Bindings on" : "Bindings off"}
      {armed && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-white/40 blur-md animate-gm-sheen" />}
    </button>
  );
}

function Toast() {
  const t = useStore((s) => s.toast);
  if (!t) return null;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-line-strong bg-surface-2 px-4 py-3 text-sm font-semibold shadow-2xl shadow-black">
      {t.text}
      {t.undo && (
        <button
          type="button"
          onClick={() => {
            t.undo?.();
            dismissToast();
          }}
          className="font-bold text-lime hover:underline"
        >
          Undo
        </button>
      )}
    </div>
  );
}
