import type { ReactNode } from 'react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, BookmarkPlus, Minus, Repeat, Spline, Trash2 } from 'lucide-react';
import { KIND_LABELS, isSplitKind } from '@/core';
import { article } from '@/lib/format';
import { ICONS, ICON_NAMES, SWATCHES } from '@/lib/icons';
import { useDesign } from '@/stores/designStore';
import { useLibrary } from '@/stores/libraryStore';
import { toast } from '@/stores/toastStore';
import { NumberField, Toggle } from './Fields';

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: ReactNode; title: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-line" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-label={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center py-1.5 text-xs ${value === o.value ? 'bg-ok/15 text-ok' : 'text-muted hover:text-text'} disabled:opacity-50`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, onChange, disabled }: { value?: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          onClick={() => onChange(c)}
          aria-label={`Colour ${c}`}
          className={`h-6 w-6 rounded-full border-2 ${value === c ? 'border-text' : 'border-transparent'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

const ARROWS = [
  { value: 'end' as const, label: <ArrowRight size={14} />, title: 'Arrow at the target' },
  { value: 'both' as const, label: <ArrowLeftRight size={14} />, title: 'Arrows at both ends' },
  { value: 'start' as const, label: <ArrowLeft size={14} />, title: 'Arrow at the source' },
  { value: 'none' as const, label: <Minus size={14} />, title: 'No arrowheads' },
];

const ROUTES = [
  { value: 'smooth' as const, label: 'Curved', title: 'Curved' },
  { value: 'step' as const, label: 'Right-angle', title: 'Right-angled (orthogonal)' },
  { value: 'straight' as const, label: 'Straight', title: 'Straight' },
];

export function EdgeProperties({ edgeId, readOnly }: { edgeId: string; readOnly: boolean }) {
  const design = useDesign((s) => s.design);
  const store = useDesign.getState();
  const edge = design.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const name = (id: string) => design.nodes.find((n) => n.id === id)?.label ?? (design.annotations?.find((a) => a.id === id)?.type === 'zone' ? 'zone' : 'note');
  const src = design.nodes.find((n) => n.id === edge.source);
  const traffic = (edge.kind ?? 'traffic') === 'traffic';
  const split = src ? isSplitKind(src.kind) : false;

  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Link</div>
        <div className="mt-1 text-sm font-semibold">
          {name(edge.source)} → {name(edge.target)}
        </div>
      </div>

      <label className="block">
        <span className="label">Label</span>
        <input
          className="input"
          value={edge.label ?? ''}
          placeholder="e.g. HTTPS, gRPC, order.created"
          maxLength={60}
          disabled={readOnly}
          onChange={(e) => store.styleEdge(edge.id, { label: e.target.value || undefined })}
        />
      </label>

      <div>
        <span className="label">What it is</span>
        <Segmented
          value={traffic ? 'traffic' : 'annotation'}
          disabled={readOnly}
          options={[
            { value: 'traffic', label: 'Carries traffic', title: 'Simulated requests flow along it' },
            { value: 'annotation', label: 'Drawing only', title: 'Just a line; the simulator ignores it' },
          ]}
          onChange={(v) => {
            const reason = store.setEdgeKind(edge.id, v);
            if (reason) toast(reason, 'warn', 4000);
          }}
        />
        <p className="mt-1.5 text-[11px] text-muted">
          {traffic
            ? `Requests flow from ${name(edge.source)} to ${name(edge.target)}.`
            : 'Dashed, and ignored by the simulator: use it for replication, config, async notes or anything you want to show.'}
        </p>
      </div>

      <div>
        <span className="label">Arrowheads</span>
        <Segmented value={edge.arrows ?? 'end'} options={ARROWS} disabled={readOnly} onChange={(v) => store.styleEdge(edge.id, { arrows: v })} />
      </div>

      <div>
        <span className="label">Line</span>
        <Segmented value={edge.pathStyle ?? 'smooth'} options={ROUTES} disabled={readOnly} onChange={(v) => store.styleEdge(edge.id, { pathStyle: v })} />
        <p className="mt-1.5 text-[11px] text-muted">Select the link and drag a + on it to add a bend; double-click a bend to remove it.</p>
      </div>

      {traffic && <Toggle label="Dashed line" checked={!!edge.dashed} disabled={readOnly} onChange={(v) => store.styleEdge(edge.id, { dashed: v || undefined })} />}

      {traffic && (
        <>
          <p className="rounded-md border border-line bg-bg p-2 text-xs text-muted">
            {split
              ? `${src?.label} splits traffic: each request goes to ONE target. Weight is this target's relative share.`
              : `${src?.label} fans out: each request calls EVERY target. Weight is the fraction of requests that make this call (0–1).`}
          </p>
          <NumberField
            meta={{ label: split ? 'Weight (relative share)' : 'Call fraction (0–1)', min: 0, max: split ? 100 : 1, step: split ? 1 : 0.05 }}
            value={edge.weight ?? 1}
            disabled={readOnly}
            onChange={(v) => store.updateEdge(edge.id, { weight: v })}
          />
          <NumberField meta={{ label: 'Network latency', unit: 'ms', min: 0, step: 1 }} value={edge.latencyMs ?? 1} disabled={readOnly} onChange={(v) => store.updateEdge(edge.id, { latencyMs: v })} />
        </>
      )}

      {!readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn"
            onClick={() => {
              const reason = store.reverseEdge(edge.id);
              if (reason) toast(`${reason} It's now drawing-only.`, 'info', 4000);
            }}
          >
            <Repeat size={14} /> Reverse
          </button>
          <button className="btn" disabled={!edge.points?.length} onClick={() => store.styleEdge(edge.id, { points: undefined })}>
            <Spline size={14} /> Remove bends
          </button>
          <button className="btn col-span-2 text-bad" onClick={() => store.removeEdges([edge.id])}>
            <Trash2 size={14} /> Delete link
          </button>
        </div>
      )}
    </div>
  );
}

export function AppearanceFields({ nodeId, readOnly }: { nodeId: string; readOnly: boolean }) {
  const node = useDesign((s) => s.design.nodes.find((n) => n.id === nodeId));
  const upsert = useLibrary((s) => s.upsert);
  if (!node) return null;
  const a = node.appearance ?? {};
  const set = (patch: Partial<typeof a>) => useDesign.getState().updateNode(node.id, { appearance: { ...a, ...patch } });

  return (
    <details className="rounded-md border border-line p-3" open={!!node.appearance}>
      <summary className="cursor-pointer text-xs font-medium text-muted">Appearance</summary>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="label">Type name</span>
          <input
            className="input"
            value={a.typeLabel ?? ''}
            placeholder={KIND_LABELS[node.kind]}
            maxLength={32}
            disabled={readOnly}
            onChange={(e) => set({ typeLabel: e.target.value || undefined })}
          />
          <span className="mt-1 block text-[11px] text-muted/80">Still simulated as {article(KIND_LABELS[node.kind])} {KIND_LABELS[node.kind]}.</span>
        </label>
        <div>
          <span className="label">Icon</span>
          <div className="grid grid-cols-8 gap-1">
            {ICON_NAMES.map((n) => {
              const Icon = ICONS[n];
              return (
                <button
                  key={n}
                  type="button"
                  disabled={readOnly}
                  aria-label={n}
                  onClick={() => set({ icon: n })}
                  className={`flex h-7 items-center justify-center rounded border ${a.icon === n ? 'border-ok/60 bg-ok/10 text-ok' : 'border-transparent text-muted hover:border-line'}`}
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="label">Colour</span>
          <Swatches value={a.color} onChange={(c) => set({ color: c })} disabled={readOnly} />
        </div>
        {!readOnly && (
          <button
            className="btn w-full"
            onClick={() => {
              upsert({ name: a.typeLabel || node.label, blurb: '', kind: node.kind, icon: a.icon ?? 'server', color: a.color ?? SWATCHES[0], config: node.config });
              toast(`Saved “${a.typeLabel || node.label}” to your library`, 'success');
            }}
          >
            <BookmarkPlus size={14} /> Save to library
          </button>
        )}
      </div>
    </details>
  );
}

export function AnnotationProperties({ id, readOnly }: { id: string; readOnly: boolean }) {
  const a = useDesign((s) => s.design.annotations?.find((x) => x.id === id));
  if (!a) return null;
  const store = useDesign.getState();
  const isZone = a.type === 'zone';
  return (
    <div className="space-y-4 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{isZone ? 'Zone' : 'Text note'} · drawing only</div>
      <label className="block">
        <span className="label">{isZone ? 'Name' : 'Text'}</span>
        {isZone ? (
          <input className="input" value={a.text} maxLength={60} disabled={readOnly} onChange={(e) => store.updateAnnotation(a.id, { text: e.target.value })} />
        ) : (
          <textarea className="input min-h-[90px]" value={a.text} maxLength={600} disabled={readOnly} onChange={(e) => store.updateAnnotation(a.id, { text: e.target.value })} />
        )}
      </label>
      {!isZone && (
        <div>
          <span className="label">Size</span>
          <Segmented
            value={a.fontSize ?? 'md'}
            disabled={readOnly}
            options={[
              { value: 'sm', label: 'Small', title: 'Small text' },
              { value: 'md', label: 'Medium', title: 'Medium text' },
              { value: 'lg', label: 'Heading', title: 'Heading' },
            ]}
            onChange={(v) => store.updateAnnotation(a.id, { fontSize: v })}
          />
        </div>
      )}
      <div>
        <span className="label">Colour</span>
        <Swatches value={a.color} onChange={(c) => store.updateAnnotation(a.id, { color: c })} disabled={readOnly} />
      </div>
      <p className="text-[11px] text-muted">Double-click it on the canvas to edit in place; drag its corners to resize. You can link notes and zones to components too.</p>
      {!readOnly && (
        <button className="btn w-full text-bad" onClick={() => store.removeNodes([a.id])}>
          <Trash2 size={14} /> Delete {isZone ? 'zone' : 'note'}
        </button>
      )}
    </div>
  );
}
