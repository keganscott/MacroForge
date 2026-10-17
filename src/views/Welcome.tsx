import { Keyboard, ListVideo, Power, Wand2 } from "lucide-react";

import { LogoMark } from "../components/brand";
import { Button, Dialog } from "../components/ui";
import { comboName } from "../lib/keys";
import { setSettings, useStore } from "../store";

/** First run: what MacroForge does, in four lines. */
export function Welcome() {
  const seen = useStore((s) => s.data!.settings.seenWelcome);
  const s = useStore((st) => st.data!.settings);
  const done = () => setSettings({ seenWelcome: true });
  return (
    <Dialog open={!seen} title="Welcome to MacroForge" onClose={done} footer={<Button variant="primary" onClick={done}>Let's go</Button>}>
      <div className="flex flex-col gap-4 text-ink">
        <LogoMark className="size-12" />
        <Item icon={<Wand2 aria-hidden className="size-4" />} title="Quick tools">
          Auto-clicker, turbo keys, remaps, auto-run and text snippets in two clicks.
        </Item>
        <Item icon={<ListVideo aria-hidden className="size-4" />} title="Macros">
          Record a sequence once or build it step by step, timed to the millisecond.
        </Item>
        <Item icon={<Keyboard aria-hidden className="size-4" />} title="Game profiles">
          Bindings switch on by themselves when their game is in front, and stop when you leave it.
        </Item>
        <Item icon={<Power aria-hidden className="size-4" />} title="Always in control">
          {comboName(s.masterHotkey.input, s.masterHotkey.mods)} turns everything on or off; {comboName(s.panicHotkey.input, s.panicHotkey.mods)} stops everything instantly. Bindings pause while this window is in front.
        </Item>
        <p className="text-xs text-ink-muted">Only use macros in games that allow them.</p>
      </div>
    </Dialog>
  );
}

function Item({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet text-white">{icon}</span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-sm text-ink-muted">{children}</p>
      </div>
    </div>
  );
}
