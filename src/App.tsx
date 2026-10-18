import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Shell, type NavTarget, type ViewId } from "./components/Shell";
import { Callout, Button } from "./components/ui";
import { useActive } from "./lib/active";
import { boot, dismissWarning, useStore } from "./store";
import { HomeView } from "./views/Home";
import { ToolsView } from "./views/Tools";
import { PresetsView } from "./views/Presets";
import { BindingsView } from "./views/Bindings";
import { MacrosView } from "./views/Macros";
import { PerformanceView } from "./views/Performance";
import { SettingsView } from "./views/Settings";
import { Welcome } from "./views/Welcome";

export function App() {
  const ready = useStore((s) => s.ready);
  const accent = useStore((s) => s.data?.settings.accent ?? "signal");
  const warning = useStore((s) => s.loadWarning);
  const [error, setError] = useState<string | null>(null);
  const [nav, setNav] = useState<NavTarget>({ view: "home" });

  useEffect(() => {
    boot().catch((e) => setError(String(e)));
  }, []);

  // Animations: on unless the user turned them off here (or chose to follow
  // Windows and Windows' Animation effects are off).
  const motion = useStore((s) => s.data?.settings.motion ?? "full");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      const reduced = motion === "off" || (motion === "system" && mq.matches);
      if (reduced) document.documentElement.dataset.motion = "reduced";
      else delete document.documentElement.dataset.motion;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [motion]);

  // Nothing animates while MacroForge is in the background.
  const active = useActive();
  useEffect(() => {
    if (active) delete document.documentElement.dataset.idle;
    else document.documentElement.dataset.idle = "1";
  }, [active]);

  useEffect(() => {
    if (accent === "signal") delete document.documentElement.dataset.accent;
    else document.documentElement.dataset.accent = accent;
  }, [accent]);

  if (error)
    return (
      <div className="grid h-full place-items-center p-10">
        <div className="max-w-lg">
          <Callout tone="bad" title="MacroForge could not start its engine.">
            <p className="font-mono text-xs break-all">{error}</p>
          </Callout>
        </div>
      </div>
    );
  if (!ready)
    return (
      <div className="grid h-full place-items-center text-ink-muted">
        <Loader2 aria-label="Starting" className="size-6 animate-spin" />
      </div>
    );

  const views: Record<ViewId, React.ReactNode> = {
    home: <HomeView />,
    tools: <ToolsView />,
    presets: <PresetsView />,
    bindings: <BindingsView focus={nav.view === "bindings" ? nav.focus : undefined} />,
    macros: <MacrosView focus={nav.view === "macros" ? nav.focus : undefined} />,
    performance: <PerformanceView />,
    settings: <SettingsView />,
  };

  return (
    <Shell view={nav.view} onNavigate={setNav}>
      {warning && (
        <div className="mb-5">
          <Callout tone="warn" title="About your saved data" action={<Button size="sm" onClick={dismissWarning}>Got it</Button>}>
            {warning}
          </Callout>
        </div>
      )}
      {views[nav.view]}
      <Welcome />
    </Shell>
  );
}
