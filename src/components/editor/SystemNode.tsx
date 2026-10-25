import { memo, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Skull } from 'lucide-react';
import { KIND_LABELS, resolveConfig, type DesignNode } from '@/core';
import { fmtMs, fmtRps } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { COLORS, KIND_ICONS } from '@/lib/kinds';
import { useLive } from '@/stores/simStore';

export type SystemNodeData = {
  node: DesignNode;
  invalid?: boolean;
  finding?: string;
  flashAt?: number;
};
export type SystemFlowNode = Node<SystemNodeData, 'system'>;

function utilColor(u: number) {
  if (u > 1) return COLORS.bad;
  if (u > 0.7) return COLORS.warn;
  return COLORS.ok;
}

/**
 * A connection point on every side. With ConnectionMode.Loose any of them can start or end a
 * link, like draw.io; they appear on hover.
 */
export function SideHandles() {
  return (
    <>
      <Handle id="t" type="source" position={Position.Top} className="br-handle" />
      <Handle id="r" type="source" position={Position.Right} className="br-handle" />
      <Handle id="b" type="source" position={Position.Bottom} className="br-handle" />
      <Handle id="l" type="source" position={Position.Left} className="br-handle" />
    </>
  );
}

function SystemNodeImpl({ id, data, selected }: NodeProps<SystemFlowNode>) {
  const { node, invalid, finding, flashAt } = data;
  const cfg = useMemo(() => resolveConfig(node), [node]);
  const running = useLive((s) => s.status !== 'stopped');
  const rt = useLive((s) => s.tick?.nodes[id]);
  const pulse = useLive((s) => s.pulses[id]);
  const ref = useRef<HTMLDivElement>(null);
  const Icon = (node.appearance?.icon && ICONS[node.appearance.icon]) || KIND_ICONS[node.kind];
  const accent = node.appearance?.color ?? COLORS.ok;
  const typeName = node.appearance?.typeLabel ?? KIND_LABELS[node.kind];

  useEffect(() => {
    if (!pulse || !ref.current) return;
    ref.current.animate(
      [{ boxShadow: `0 0 0 0 ${pulse.color}` }, { boxShadow: '0 0 0 18px transparent' }],
      { duration: 600, iterations: 2, easing: 'ease-out' },
    );
  }, [pulse]);

  useEffect(() => {
    if (!flashAt || !ref.current) return;
    ref.current.animate(
      [{ boxShadow: `0 0 0 0 ${COLORS.ok}` }, { boxShadow: '0 0 0 16px transparent' }],
      { duration: 500, iterations: 3, easing: 'ease-out' },
    );
  }, [flashAt]);

  const live = running && rt;
  const status = live ? rt.status : 'healthy';
  const util = live ? rt.utilization : 0;
  const borderColor =
    invalid || status === 'down'
      ? COLORS.bad
      : status === 'degraded' || status === 'failing_over'
        ? COLORS.warn
        : selected
          ? COLORS.ok
          : COLORS.border;
  const glow = live && util > 0.8 && status !== 'down' ? `0 0 22px -4px ${utilColor(util)}` : undefined;
  const replicas = live ? rt.activeReplicas : cfg.replicas;
  const warming = live ? rt.warmingUntil.length : 0;
  const showReplicas = node.kind !== 'client' && node.kind !== 'external_api';

  return (
    <div
      ref={ref}
      className="relative w-[176px] rounded-lg border bg-panel px-3 py-2.5 transition-[border-color,opacity] duration-200"
      style={{ borderColor, boxShadow: glow, opacity: status === 'down' ? 0.55 : 1 }}
      aria-label={`${node.label} (${KIND_LABELS[node.kind]})${live ? `, ${status}` : ''}`}
    >
      <SideHandles />

      {finding && !live && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-bad ring-2 ring-bg" title={finding} />
      )}

      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-bg"
          style={{ color: status === 'down' ? COLORS.bad : accent }}
        >
          {status === 'down' ? <Skull size={15} /> : <Icon size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-text">{node.label}</div>
          <div
            className="truncate text-[10px] uppercase tracking-wide text-muted"
            title={node.appearance?.typeLabel ? `${typeName}: behaves like ${KIND_LABELS[node.kind]}` : undefined}
          >
            {typeName}
          </div>
        </div>
        {showReplicas && (
          <div className="flex flex-col items-end">
            <span className="font-num text-[11px] text-muted">×{replicas}</span>
            {warming > 0 && <span className="font-num text-[10px] text-ok">+{warming}</span>}
          </div>
        )}
      </div>

      {status !== 'healthy' && (
        <div className="mt-2">
          <span
            className={`chip ${status === 'failing_over' ? 'br-breathe' : ''}`}
            style={{
              color: status === 'down' ? COLORS.bad : COLORS.warn,
              background: `${status === 'down' ? COLORS.bad : COLORS.warn}1f`,
            }}
          >
            {status === 'failing_over' ? 'Failing over' : status}
          </span>
        </div>
      )}

      {live && node.kind !== 'client' && (
        <div className="mt-2 space-y-1">
          <div className="h-1 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full transition-[width] duration-150"
              style={{ width: `${Math.min(100, util * 100)}%`, background: utilColor(util) }}
            />
          </div>
          <div className="flex justify-between font-num text-[10px] text-muted">
            <span>{fmtRps(rt.inRps)} rps</span>
            <span style={{ color: util > 1 ? COLORS.bad : undefined }}>{Math.round(util * 100)}%</span>
            <span>{node.kind === 'queue' ? `lag ${Number.isFinite(rt.queueLagSec) ? rt.queueLagSec.toFixed(1) : '∞'}s` : fmtMs(rt.latencyMs)}</span>
          </div>
          {node.kind === 'queue' && (
            <div className="h-1 overflow-hidden rounded-full bg-bg" title={`Queue depth ${Math.round(rt.queueDepth)}`}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (rt.queueDepth / (cfg.maxQueueDepth ?? 1)) * 100)}%`,
                  background: COLORS.warn,
                }}
              />
            </div>
          )}
        </div>
      )}
      {live && node.kind === 'client' && (
        <div className="mt-2 font-num text-[10px] text-muted">{fmtRps(rt.inRps)} rps sent</div>
      )}
    </div>
  );
}

export const SystemNode = memo(SystemNodeImpl);
