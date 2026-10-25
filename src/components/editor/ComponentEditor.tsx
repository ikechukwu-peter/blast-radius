import { useState } from 'react';
import { KIND_LABELS, type NodeKind } from '@/core';
import { article } from '@/lib/format';
import { ICONS, ICON_NAMES, SWATCHES } from '@/lib/icons';
import { KIND_BLURBS, KIND_ICONS, PALETTE_ORDER } from '@/lib/kinds';
import { useLibrary, type CustomComponent } from '@/stores/libraryStore';
import { toast } from '@/stores/toastStore';
import { Modal } from '@/components/ui/Modal';

/** What each kind means when you borrow its behaviour for your own component. */
const BEHAVIOUR: Record<NodeKind, string> = {
  client: 'Sends traffic into the system',
  cdn: 'Answers most requests itself, forwards misses',
  load_balancer: 'Sends each request to one healthy target',
  api_server: 'Handles requests and calls every dependency',
  cache: 'Answers hits, forwards misses; if it dies, everything falls through',
  database: 'Stores data; can fail over to a standby',
  queue: 'Accepts work instantly and buffers it for workers',
  worker: 'Processes queued jobs',
  external_api: 'A third party: slow, occasionally failing, not yours',
};

function Editor({ draft, onClose }: { draft: Partial<CustomComponent>; onClose: () => void }) {
  const upsert = useLibrary((s) => s.upsert);
  const [name, setName] = useState(draft.name ?? '');
  const [blurb, setBlurb] = useState(draft.blurb ?? '');
  const [kind, setKind] = useState<NodeKind>(draft.kind ?? 'api_server');
  const [icon, setIcon] = useState(draft.icon || 'server');
  const [color, setColor] = useState(draft.color ?? SWATCHES[0]);
  const Preview = ICONS[icon] ?? KIND_ICONS[kind];

  const save = () => {
    if (!name.trim()) return toast('Give the component a name.', 'warn');
    upsert({ id: draft.builtIn ? undefined : draft.id, name: name.trim(), blurb: blurb.trim(), kind, icon, color, config: draft.config });
    toast(`${name.trim()} is in your library. Drag it onto the canvas.`, 'success');
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-bg p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line" style={{ color }}>
          <Preview size={17} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{name || 'Your component'}</div>
          <div className="truncate text-[11px] uppercase tracking-wide text-muted">behaves like {KIND_LABELS[kind]}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Name</span>
          <input className="input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kafka" autoFocus />
        </label>
        <label className="block">
          <span className="label">Note (optional)</span>
          <input className="input" value={blurb} maxLength={60} onChange={(e) => setBlurb(e.target.value)} placeholder="e.g. Order events" />
        </label>
      </div>

      <div>
        <span className="label">Behaves like</span>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {PALETTE_ORDER.map((k) => {
            const Icon = KIND_ICONS[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${kind === k ? 'border-ok/60 bg-ok/10 text-text' : 'border-line text-muted hover:border-muted/60'}`}
                title={KIND_BLURBS[k]}
              >
                <Icon size={13} className="shrink-0" /> {KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{BEHAVIOUR[kind]}. The simulator runs it exactly like {article(KIND_LABELS[kind])} {KIND_LABELS[kind]}.</p>
      </div>

      <div>
        <span className="label">Icon</span>
        <div className="grid grid-cols-10 gap-1">
          {ICON_NAMES.map((n) => {
            const Icon = ICONS[n];
            return (
              <button
                key={n}
                type="button"
                onClick={() => setIcon(n)}
                aria-label={n}
                className={`flex h-8 items-center justify-center rounded-md border ${icon === n ? 'border-ok/60 bg-ok/10' : 'border-transparent hover:border-line'}`}
                style={{ color: icon === n ? color : undefined }}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="label">Colour</span>
        <div className="flex gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-text' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save}>
          Save to library
        </button>
      </div>
    </div>
  );
}

export function ComponentEditor({ draft, onClose }: { draft: Partial<CustomComponent> | null; onClose: () => void }) {
  return (
    <Modal open={!!draft} onClose={onClose} title={draft?.id && !draft.builtIn ? 'Edit component' : 'New component'} wide>
      {/* Keyed so each opening starts from its own draft. */}
      {draft && <Editor key={draft.id ?? 'new'} draft={draft} onClose={onClose} />}
    </Modal>
  );
}
