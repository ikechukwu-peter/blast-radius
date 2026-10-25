import { Trash2 } from 'lucide-react';
import { EDITABLE_FIELDS, KIND_DEFAULTS, KIND_LABELS, resolveConfig, type AutoscaleConfig, type NodeConfig } from '@/core';
import { ICONS } from '@/lib/icons';
import { KIND_BLURBS, KIND_ICONS } from '@/lib/kinds';
import { AnnotationProperties, AppearanceFields, EdgeProperties } from './ObjectProperties';
import { useDesign } from '@/stores/designStore';
import { NumberField, PctField, Toggle, type FieldMeta } from './Fields';

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

export function PropertiesPanel({ readOnly = false }: { readOnly?: boolean }) {
  const design = useDesign((s) => s.design);
  const selectedNodeId = useDesign((s) => s.selectedNodeId);
  const selectedEdgeId = useDesign((s) => s.selectedEdgeId);
  const selectedNodeIds = useDesign((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDesign((s) => s.selectedEdgeIds);
  const { updateNode, updateNodeConfig, removeNodes, removeEdges } = useDesign.getState();

  const node = design.nodes.find((n) => n.id === selectedNodeId);
  const edge = design.edges.find((e) => e.id === selectedEdgeId);

  if (edge) return <EdgeProperties edgeId={edge.id} readOnly={readOnly} />;

  const annotation = design.annotations?.find((a) => a.id === selectedNodeId);
  if (annotation) return <AnnotationProperties id={annotation.id} readOnly={readOnly} />;

  if (!node) {
    const many = selectedNodeIds.length + selectedEdgeIds.length;
    return (
      <div className="space-y-3 p-6 text-center text-sm text-muted">
        {many > 1 ? (
          <>
            <p className="text-text">{many} items selected</p>
            <p className="text-xs">Drag to move them together. ⌘D duplicates, ⌘C / ⌘V copies, Delete removes.</p>
            {!readOnly && (
              <button className="btn mx-auto text-bad" onClick={() => { removeNodes(selectedNodeIds); removeEdges(selectedEdgeIds); }}>
                <Trash2 size={14} /> Delete selection
              </button>
            )}
          </>
        ) : (
          <>
            <p>Select a component, link, note or zone to edit it.</p>
            <p className="text-xs">
              Hover a component and drag from any of its four dots to another component to link them. Requests flow from where you start to where you end; the arrowheads are just how it looks.
            </p>
            <p className="text-xs">Shift-drag to select several. Double-click a link to label it.</p>
          </>
        )}
      </div>
    );
  }

  const cfg = resolveConfig(node);
  const fields = EDITABLE_FIELDS[node.kind];
  const Icon = (node.appearance?.icon && ICONS[node.appearance.icon]) || KIND_ICONS[node.kind];
  const set = (patch: Partial<NodeConfig>) => updateNodeConfig(node.id, patch);
  const as = cfg.autoscale;
  const setAs = (patch: Partial<AutoscaleConfig>) => as && set({ autoscale: { ...as, ...patch } });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-bg" style={{ color: node.appearance?.color ?? 'var(--ok)' }}>
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {node.appearance?.typeLabel ? `${node.appearance.typeLabel} · behaves like ${KIND_LABELS[node.kind]}` : KIND_LABELS[node.kind]}
          </div>
          <div className="text-xs text-muted/80">{KIND_BLURBS[node.kind]}</div>
        </div>
      </div>

      <label className="block">
        <span className="label">Name</span>
        <input className="input" value={node.label} disabled={readOnly} maxLength={40} onChange={(e) => updateNode(node.id, { label: e.target.value })} />
      </label>

      <AppearanceFields nodeId={node.id} readOnly={readOnly} />

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
