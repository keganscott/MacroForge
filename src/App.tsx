import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Shell, type NavTarget, type ViewId } from "./components/Shell";
import { Callout, Button } from "./components/ui";
import { boot, dismissWarning, useStore } from "./store";
import { HomeView } from "./views/Home";
import { ToolsView } from "./views/Tools";
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
