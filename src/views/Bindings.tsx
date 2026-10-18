import { useEffect, useMemo, useState } from "react";
import { Ban, Copy, Crosshair, Download, Gamepad2, Globe, Keyboard, ListVideo, Lock, MousePointer2, Pencil, Plus, Power, RefreshCw, Repeat2, Search, Share2, Shuffle, Trash2, X } from "lucide-react";

import { Button, Callout, Card, cx, Dialog, Empty, Field, IconButton, Keycap, LiveDot, PageHeader, StatusBadge, Switch, TextInput } from "../components/ui";
import { actionSummary, ACTION_TEXT, bindingTitle, MODE_TEXT, newId, parseShare, shareProfile } from "../lib/describe";
import type { AppEntry, Binding, Profile } from "../lib/types";
import { backend, mutateProfile, toast, update, useStore } from "../store";
import { conditionBadges } from "../components/Conditions";
import { comboName } from "../lib/keys";
import { BindingEditor } from "./BindingEditor";

export function BindingsView({ focus }: { focus?: string }) {
  const data = useStore((s) => s.data)!;
  const status = useStore((s) => s.status)!;
  const [pid, setPid] = useState(focus ?? data.profiles[0]!.id);
  const [editing, setEditing] = useState<Binding | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [profileDialog, setProfileDialog] = useState<Profile | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState("");

  const profile = data.profiles.find((p) => p.id === pid) ?? data.profiles[0]!;
  useEffect(() => {
    if (!data.profiles.some((p) => p.id === pid)) setPid(data.profiles[0]!.id);
  }, [data.profiles, pid]);

  const live = new Set([...status.running.map((r) => r.id), ...status.locks]);
  const muted = new Set(status.muted ?? []);
  const needle = q.trim().toLowerCase();
  const shown = profile.bindings.filter((b) => !needle || bindingTitle(b, data.macros).toLowerCase().includes(needle) || actionSummary(b.action, data.macros).toLowerCase().includes(needle));

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const remove = (b: Binding) => {
    const before = profile.bindings;
    mutateProfile(profile.id, (p) => ({ ...p, bindings: p.bindings.filter((x) => x.id !== b.id) }));
    toast("Binding deleted", () => mutateProfile(profile.id, (p) => ({ ...p, bindings: before })));
  };

  const duplicate = (b: Binding) => {
    const copy: Binding = { ...structuredClone(b), id: newId("b"), name: b.name ? `${b.name} copy` : "", enabled: false };
    mutateProfile(profile.id, (p) => {
      const i = p.bindings.findIndex((x) => x.id === b.id);
      const next = [...p.bindings];
      next.splice(i + 1, 0, copy);
      return { ...p, bindings: next };
    });
    toast("Copied (turned off until you change its key)");
  };

  return (
    <>
      <PageHeader
        title="Bindings"
        description="Each binding turns a key or mouse button into something else. Profiles group them; a game profile is only active while that game is in front."
        actions={
          <>
            <Button icon={<Download aria-hidden className="size-4" />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={openNew}>
              New binding
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-[260px_1fr] gap-6">
        {/* ------------------------------------------------ profiles */}
        <div className="flex flex-col gap-2">
          {data.profiles.map((p) => {
            const active = status.activeProfiles.includes(p.id);
            const on = p.id === profile.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPid(p.id)}
                aria-current={on || undefined}
                className={cx(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  on ? "border-violet bg-violet/10" : "border-line bg-surface-1 hover:border-line-strong",
                )}
              >
                <span className={cx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", on ? "bg-violet text-on-accent" : "bg-surface-3 text-ink-muted")}>
                  {p.apps.length ? <Gamepad2 aria-hidden className="size-4" /> : <Globe aria-hidden className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">{p.name}</span>
                    {active && p.enabled && <LiveDot />}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {!p.enabled ? "Off" : p.apps.length ? p.apps.join(", ") : "Everywhere"} · {p.bindings.length}
                  </span>
                </span>
              </button>
            );
          })}
          <Button
            variant="ghost"
            className="justify-start"
            icon={<Plus aria-hidden className="size-4" />}
            onClick={() => setProfileDialog({ id: "", name: "", enabled: true, apps: [], bindings: [] })}
          >
            New game profile
          </Button>
        </div>

        {/* ------------------------------------------------ bindings */}
        <div className="min-w-0">
          <Card className="mb-4 flex flex-wrap items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
                {profile.name}
                {status.activeProfiles.includes(profile.id) && profile.enabled ? (
                  <StatusBadge tone="ok">Active now</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">{profile.enabled ? "Waiting for its game" : "Off"}</StatusBadge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{profile.apps.length ? `Only while ${profile.apps.join(", ")} is in front.` : "Active in every app."}</p>
            </div>
            <Switch label={`${profile.name} on`} checked={profile.enabled} onChange={(enabled) => mutateProfile(profile.id, (p) => ({ ...p, enabled }))} />
            <IconButton label="Edit profile" onClick={() => setProfileDialog(profile)}>
              <Pencil aria-hidden className="size-4" />
            </IconButton>
            <IconButton
              label="Copy share code"
              onClick={() => {
                void navigator.clipboard.writeText(shareProfile(data, profile));
                toast("Share code copied: send it to a friend, they paste it into Import");
              }}
            >
              <Share2 aria-hidden className="size-4" />
            </IconButton>
          </Card>

          {profile.bindings.length > 4 && (
            <label className="mb-3 flex max-w-sm items-center gap-2 rounded-lg border border-line bg-surface-1 px-3">
              <Search aria-hidden className="size-4 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter bindings" aria-label="Filter bindings" className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint" />
            </label>
          )}

          {profile.bindings.length === 0 ? (
            <Empty
              icon={<Keyboard aria-hidden className="size-6" />}
              title="No bindings in this profile yet"
              action={
                <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={openNew}>
                  New binding
                </Button>
              }
            >
              Pick a key, then choose what it does: play a macro, rapid fire, remap, hold down or disable. Or start from a Quick tool.
            </Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((b) => (
                <BindingRow
                  key={b.id}
                  b={b}
                  live={live.has(b.id)}
                  muted={muted.has(b.id)}
                  onEdit={() => {
                    setEditing(b);
                    setEditorOpen(true);
                  }}
                  onToggle={(enabled) => mutateProfile(profile.id, (p) => ({ ...p, bindings: p.bindings.map((x) => (x.id === b.id ? { ...x, enabled } : x)) }))}
                  onDuplicate={() => duplicate(b)}
                  onDelete={() => remove(b)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <BindingEditor open={editorOpen} initial={editing} profileId={profile.id} onClose={() => setEditorOpen(false)} />
      <ProfileDialog profile={profileDialog} onClose={() => setProfileDialog(null)} onCreated={setPid} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={setPid} />
    </>
  );
}

const ROW_ICON: Record<Binding["action"]["type"], typeof Keyboard> = {
  macro: ListVideo,
  rapid: Repeat2,
  remap: Shuffle,
  holdLock: Lock,
  block: Ban,
};

function BindingRow({
  b,
  live,
  muted,
  onEdit,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  b: Binding;
  live: boolean;
  /** Switched off in game with its own on / off key. */
  muted: boolean;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const macros = useStore((s) => s.data!.macros);
  const missing = b.action.type === "macro" && !macros.some((m) => m.id === (b.action as { macroId: string }).macroId);
  const Icon = ROW_ICON[b.action.type];
  const tk = b.toggleKey?.input ? b.toggleKey : null;
  const mode =
    b.action.type === "remap" || b.action.type === "block" || b.action.type === "holdLock"
      ? null
      : MODE_TEXT[b.action.type === "rapid" && b.trigger.mode === "press" ? "hold" : b.trigger.mode].label;
  return (
    <li
      className={cx(
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl border bg-surface-1 py-3 pr-4 pl-3 transition-colors",
        live ? "border-lime/50" : muted ? "border-line border-dashed" : "border-line hover:border-line-strong",
        (!b.enabled || muted) && "opacity-70",
      )}
    >
      {live && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-lime" />}
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <span
          className={cx(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            live ? "bg-lime text-black" : b.enabled && !muted ? "bg-violet/15 text-violet" : "bg-surface-3 text-ink-faint",
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        <span className="w-44 shrink-0">
          <Keycap input={b.trigger.input} mods={b.trigger.mods} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold">{bindingTitle(b, macros)}</span>
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-lime/15 px-1.5 py-px text-[11px] font-bold text-lime">
                <LiveDot /> Running
              </span>
            )}
            {muted && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-1.5 py-px text-[11px] font-bold text-ink-muted">
                <Power aria-hidden className="size-3" /> Off for now{tk ? ` · ${comboName(tk.input, tk.mods)} turns it on` : ""}
              </span>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span>{ACTION_TEXT[b.action.type].label}</span>
            {b.name && <span className="truncate">· {actionSummary(b.action, macros)}</span>}
            {missing && <span className="font-bold text-bad">· its macro was deleted</span>}
            {conditionBadges(b.conditions).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md border border-violet/40 bg-violet/10 px-1.5 py-px text-[11px] font-bold text-violet-soft">
                {t.startsWith("Not") ? <MousePointer2 aria-hidden className="size-3" /> : <Crosshair aria-hidden className="size-3" />}
                {t}
              </span>
            ))}
            {tk && !muted && (
              <span className="inline-flex items-center gap-1 rounded-md border border-line-strong px-1.5 py-px text-[11px] font-bold text-ink-muted" title="Its own on / off key">
                <Power aria-hidden className="size-3" /> {comboName(tk.input, tk.mods)} on / off
              </span>
            )}
          </span>
        </span>
        {mode && <span className="shrink-0 rounded-md border border-line-strong px-2 py-0.5 text-[11px] font-bold text-ink-muted">{mode}</span>}
      </button>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label="Duplicate" onClick={onDuplicate}>
          <Copy aria-hidden className="size-4" />
        </IconButton>
        <IconButton label="Delete" onClick={onDelete} className="hover:text-bad">
          <Trash2 aria-hidden className="size-4" />
        </IconButton>
      </div>
      <Switch label={`${b.name || "Binding"} on`} checked={b.enabled} onChange={onToggle} />
    </li>
  );
}

function ProfileDialog({ profile, onClose, onCreated }: { profile: Profile | null; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [running, setRunning] = useState<AppEntry[] | null>(null);
  const [manual, setManual] = useState("");
  const data = useStore((s) => s.data)!;
  const isNew = profile !== null && profile.id === "";
  const isGlobal = profile?.id === "global";

  const refresh = () => {
    setRunning(null);
    void backend().listApps().then(setRunning);
  };
  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setApps(profile.apps);
    setManual("");
    refresh();
  }, [profile]);

  const addApp = (exe: string) => {
    const e = exe.trim().toLowerCase().split(/[\\/]/).pop() ?? "";
    if (e && !apps.includes(e)) setApps([...apps, e]);
  };

  const save = () => {
    const n = name.trim() || (apps[0] ? apps[0].replace(/\.exe$/, "") : "Profile");
    if (isNew) {
      const id = newId("p");
      update((d) => ({ ...d, profiles: [...d.profiles, { id, name: n, enabled: true, apps, bindings: [] }] }));
      onCreated(id);
    } else if (profile) {
      mutateProfile(profile.id, (p) => ({ ...p, name: n, apps }));
    }
    onClose();
  };

  const del = () => {
    if (!profile) return;
    const before = data.profiles;
    update((d) => ({ ...d, profiles: d.profiles.filter((p) => p.id !== profile.id) }));
    toast(`Deleted ${profile.name}`, () => update((d) => ({ ...d, profiles: before })));
    onClose();
  };

  return (
    <Dialog
      open={profile !== null}
      title={isNew ? "New game profile" : "Edit profile"}
      onClose={onClose}
      footer={
        <>
          {!isNew && !isGlobal && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 aria-hidden className="size-4" />} onClick={del}>
              Delete profile
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={isNew && apps.length === 0}>
            {isNew ? "Create profile" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 text-ink">
        <Field label="Name">
          <TextInput label="Profile name" value={name} onChange={setName} placeholder="e.g. Valorant" autoFocus />
        </Field>
        <Field
          label={isGlobal ? "Limit to apps (optional)" : "Active while this game is in front"}
          hint="MacroForge reads only the name of the app in front (for example cs2.exe), never the game itself. Runs and held keys stop when you switch away."
        >
          <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-surface-2 p-2">
            {apps.length === 0 && <span className="px-1 text-xs text-ink-faint">{isGlobal ? "Everywhere" : "Pick a game below"}</span>}
            {apps.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-md bg-violet px-2 py-1 font-mono text-xs font-bold text-on-accent">
                {a}
                <button type="button" aria-label={`Remove ${a}`} onClick={() => setApps(apps.filter((x) => x !== a))}>
                  <X aria-hidden className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold">Running now</span>
            <IconButton label="Refresh" onClick={refresh}>
              <RefreshCw aria-hidden className="size-3.5" />
            </IconButton>
          </div>
          <div className="scrollbar-quiet flex max-h-48 flex-col gap-1 overflow-y-auto">
            {running === null && <span className="text-xs text-ink-faint">Looking…</span>}
            {running?.map((a) => (
              <button
                key={a.exe}
                type="button"
                disabled={apps.includes(a.exe)}
                onClick={() => addApp(a.exe)}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-40"
              >
                <Plus aria-hidden className="size-3.5 text-violet-soft" />
                <span className="font-mono text-xs text-ink">{a.exe}</span>
                <span className="truncate text-xs text-ink-faint">{a.title}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <TextInput label="App name" value={manual} onChange={setManual} placeholder="or type it: game.exe" className="flex-1" />
            <Button
              onClick={() => {
                addApp(manual);
                setManual("");
              }}
              disabled={!manual.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (id: string) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCode("");
      setErr(null);
    }
  }, [open]);
  const preview = useMemo(() => {
    if (!code.trim()) return null;
    try {
      return parseShare(code);
    } catch (e) {
      return e as Error;
    }
  }, [code]);
  const go = () => {
    if (!preview || preview instanceof Error) return setErr(preview?.message ?? "Paste a code first.");
    update((d) => ({ ...d, profiles: [...d.profiles, { ...preview.profile, enabled: true }], macros: [...d.macros, ...preview.macros] }));
    toast(`Imported ${preview.profile.name}`);
    onImported(preview.profile.id);
    onClose();
  };
  return (
    <Dialog
      open={open}
      title="Import a profile"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={!preview || preview instanceof Error}>
            Import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p>Paste a share code (it starts with MF1-). It is added as a new profile; nothing you have is changed.</p>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Share code"
          rows={4}
          className="field h-auto py-2 font-mono text-xs break-all"
          placeholder="MF1-…"
        />
        {preview instanceof Error && <Callout tone="bad" title={preview.message} />}
        {preview && !(preview instanceof Error) && (
          <Callout tone="ok" title={preview.profile.name}>
            {preview.profile.bindings.length} binding(s), {preview.macros.length} macro(s)
            {preview.profile.apps.length ? `, for ${preview.profile.apps.join(", ")}` : ""}.
          </Callout>
        )}
        {err && <Callout tone="bad" title={err} />}
      </div>
    </Dialog>
  );
}
