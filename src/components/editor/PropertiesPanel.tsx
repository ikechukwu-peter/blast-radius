import { Trash2 } from 'lucide-react';
import { EDITABLE_FIELDS, KIND_DEFAULTS, KIND_LABELS, isSplitKind, resolveConfig, type AutoscaleConfig, type NodeConfig } from '@/core';
import { KIND_BLURBS, KIND_ICONS } from '@/lib/kinds';
import { useDesign } from '@/stores/designStore';

type FieldMeta = { label: string; unit?: string; min?: number; max?: number; step?: number; help?: string };

const NUMBER_FIELDS: Partial<Record<keyof NodeConfig, FieldMeta>> = {
  replicas: { label: 'Replicas', min: 1, max: 50, step: 1, help: '2+ removes the single point of failure' },
  capacityPerReplica: { label: 'Capacity per replica', unit: 'rps', min: 1, step: 100 },
  baseLatencyMs: { label: 'Base latency', unit: 'ms', min: 0, step: 1 },
  maxQueueDepth: { label: 'Max queue depth', unit: 'msgs', min: 1, step: 1000 },
  failoverSeconds: { label: 'Failover time', unit: 's', min: 0, max: 600, step: 1, help: '0 = no automatic failover (needs 2+ replicas)' },
  rps: { label: 'Traffic', unit: 'rps', min: 0, step: 100 },
  retries: { label: 'Retries on failure', min: 0, max: 5, step: 1, help: 'Retries multiply load during incidents' },
  timeoutMs: { label: 'Timeout', unit: 'ms', min: 50, step: 100 },
};

const PCT_FIELDS: Partial<Record<keyof NodeConfig, FieldMeta>> = {
  hitRate: { label: 'Hit rate', max: 0.99 },
  errorRate: { label: 'Intrinsic error rate', max: 0.5 },
};

function NumberField({ meta, value, onChange, disabled }: { meta: FieldMeta; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="label">
        {meta.label}
        {meta.unit && <span className="text-muted/60"> ({meta.unit})</span>}
      </span>
      <input
        type="number"
        className="input font-num"
        value={Number.isFinite(value) ? value : ''}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value === '' || Number.isNaN(v)) return;
          const lo = meta.min ?? -Infinity;
          const hi = meta.max ?? Infinity;
          onChange(Math.min(hi, Math.max(lo, v)));
        }}
      />
      {meta.help && <span className="mt-1 block text-[11px] text-muted/80">{meta.help}</span>}
    </label>
  );
}

function PctField({ meta, value, onChange, disabled }: { meta: FieldMeta; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const max = meta.max ?? 1;
  return (
    <label className="block">
      <span className="label flex justify-between">
        <span>{meta.label}</span>
        <span className="font-num text-text">{(value * 100).toFixed(value < 0.1 ? 1 : 0)}%</span>
      </span>
      <input
        type="range"
        className="w-full accent-[var(--ok)]"
        min={0}
        max={max}
        step={max <= 0.5 ? 0.001 : 0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange, help, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string; disabled?: boolean }) {
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex w-full items-center justify-between rounded-md py-1 text-sm disabled:opacity-50"
      >
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-ok/70' : 'bg-line'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-text transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
      </button>
      {help && <span className="block text-[11px] text-muted/80">{help}</span>}
    </div>
  );
}

export function PropertiesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const design = useDesign((s) => s.design);
  const selectedNodeId = useDesign((s) => s.selectedNodeId);
  const selectedEdgeId = useDesign((s) => s.selectedEdgeId);
  const { updateNode, updateNodeConfig, removeNodes, updateEdge, removeEdges } = useDesign.getState();

  const node = design.nodes.find((n) => n.id === selectedNodeId);
  const edge = design.edges.find((e) => e.id === selectedEdgeId);

  if (edge) {
    const src = design.nodes.find((n) => n.id === edge.source);
    const dst = design.nodes.find((n) => n.id === edge.target);
    const split = src ? isSplitKind(src.kind) : false;
    return (
      <div className="space-y-4 p-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Connection</div>
          <div className="mt-1 text-sm font-semibold">
            {src?.label} → {dst?.label}
          </div>
          <p className="mt-2 rounded-md border border-line bg-bg p-2 text-xs text-muted">
            {split
              ? `${src?.label} splits traffic: each request goes to ONE target. Weight is this target's relative share.`
              : `${src?.label} fans out: each request calls EVERY target. Weight is the fraction of requests that make this call (0–1).`}
          </p>
        </div>
        <NumberField
          meta={{ label: split ? 'Weight (relative share)' : 'Call fraction (0–1)', min: 0, max: split ? 100 : 1, step: split ? 1 : 0.05 }}
          value={edge.weight ?? 1}
          disabled={readOnly}
          onChange={(v) => updateEdge(edge.id, { weight: v })}
        />
        <NumberField
          meta={{ label: 'Network latency', unit: 'ms', min: 0, step: 1 }}
          value={edge.latencyMs ?? 1}
          disabled={readOnly}
          onChange={(v) => updateEdge(edge.id, { latencyMs: v })}
        />
        {!readOnly && (
          <button className="btn w-full text-bad" onClick={() => removeEdges([edge.id])}>
            <Trash2 size={14} /> Delete connection
          </button>
        )}
      </div>
    );
  }

  if (!node) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        <p>Select a component or connection to edit it.</p>
        <p className="mt-3 text-xs">
          Connect components by dragging from the right handle of one to the left handle of another. Traffic flows left to right.
        </p>
      </div>
    );
  }

  const cfg = resolveConfig(node);
  const fields = EDITABLE_FIELDS[node.kind];
  const Icon = KIND_ICONS[node.kind];
  const set = (patch: Partial<NodeConfig>) => updateNodeConfig(node.id, patch);
  const as = cfg.autoscale;
  const setAs = (patch: Partial<AutoscaleConfig>) => as && set({ autoscale: { ...as, ...patch } });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-bg text-ok">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{KIND_LABELS[node.kind]}</div>
          <div className="text-xs text-muted/80">{KIND_BLURBS[node.kind]}</div>
        </div>
      </div>

      <label className="block">
        <span className="label">Name</span>
        <input className="input" value={node.label} disabled={readOnly} maxLength={40} onChange={(e) => updateNode(node.id, { label: e.target.value })} />
      </label>

      {fields.map((f) => {
        if (NUMBER_FIELDS[f]) {
          return <NumberField key={f} meta={NUMBER_FIELDS[f]!} value={cfg[f] as number} disabled={readOnly} onChange={(v) => set({ [f]: v })} />;
        }
        if (PCT_FIELDS[f]) {
          return <PctField key={f} meta={PCT_FIELDS[f]!} value={cfg[f] as number} disabled={readOnly} onChange={(v) => set({ [f]: v })} />;
        }
        if (f === 'trafficPattern') {
          return (
            <label key={f} className="block">
              <span className="label">Traffic pattern</span>
              <select className="input" value={cfg.trafficPattern} disabled={readOnly} onChange={(e) => set({ trafficPattern: e.target.value as NodeConfig['trafficPattern'] })}>
                <option value="constant">Constant</option>
                <option value="diurnal">Diurnal (60s day, 0.5x–1.5x)</option>
                <option value="spiky">Spiky (3x bursts every 20s)</option>
              </select>
            </label>
          );
        }
        if (f === 'circuitBreaker') {
          return (
            <Toggle
              key={f}
              label="Circuit breaker on outgoing calls"
              help="Fails fast when a dependency is failing, so it can recover"
              checked={!!cfg.circuitBreaker}
              disabled={readOnly}
              onChange={(v) => set({ circuitBreaker: v })}
            />
          );
        }
        if (f === 'autoscale' && as) {
          return (
            <div key={f} className="rounded-md border border-line p-3">
              <Toggle label="Autoscaling" checked={as.enabled} disabled={readOnly} onChange={(v) => setAs({ enabled: v })} />
              {as.enabled && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <NumberField meta={{ label: 'Min', min: 1, max: 100 }} value={as.min} disabled={readOnly} onChange={(v) => setAs({ min: v })} />
                  <NumberField meta={{ label: 'Max', min: 1, max: 100 }} value={as.max} disabled={readOnly} onChange={(v) => setAs({ max: v })} />
                  <NumberField meta={{ label: 'Target util %', min: 10, max: 95 }} value={Math.round(as.targetUtilization * 100)} disabled={readOnly} onChange={(v) => setAs({ targetUtilization: v / 100 })} />
                  <NumberField meta={{ label: 'Warm-up', unit: 's', min: 0, max: 300 }} value={as.warmupSeconds} disabled={readOnly} onChange={(v) => setAs({ warmupSeconds: v })} />
                </div>
              )}
            </div>
          );
        }
        return null;
      })}

      {!readOnly && (
        <div className="flex gap-2 pt-2">
          <button
            className="btn flex-1"
            title="Reset all fields to defaults"
            onClick={() => useDesign.getState().updateNodeConfig(node.id, Object.fromEntries(Object.keys(node.config ?? {}).map((k) => [k, KIND_DEFAULTS[node.kind][k as keyof NodeConfig]])))}
          >
            Reset to defaults
          </button>
          <button className="btn flex-1 text-bad" onClick={() => removeNodes([node.id])}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
