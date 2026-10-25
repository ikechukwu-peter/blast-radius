import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BaseEdge, EdgeLabelRenderer, useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import { Scissors, Zap } from 'lucide-react';
import type { DesignEdge } from '@/core';
import { edgeGeometry, type Pt } from '@/lib/edgePath';
import { clamp, fmtMs, fmtRps } from '@/lib/format';
import { COLORS } from '@/lib/kinds';
import { useDesign } from '@/stores/designStore';
import { useViewTransform } from '@/lib/viewTransform';
import { useLive } from '@/stores/simStore';

export type TrafficEdgeData = {
  edge: DesignEdge;
  split: boolean;
  targetId: string;
  invalid?: boolean;
  editable?: boolean;
};
export type TrafficFlowEdge = Edge<TrafficEdgeData, 'traffic'>;

const GRID = 10;
const snap = (p: Pt): Pt => ({ x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID });

/**
 * Particles only re-render when their bucketed props change, so the SVG
 * <animateMotion> elements keep running smoothly between simulation ticks.
 */
const Particles = memo(function Particles({ path, count, color, dur }: { path: string; count: number; color: string; dur: number }) {
  if (!count) return null;
  return (
    <g pointerEvents="none">
      {Array.from({ length: count }, (_, i) => {
        const begin = `${(-(i * dur) / count).toFixed(2)}s`;
        return (
          <g key={i}>
            <circle r={5} fill={color} opacity={0.18}>
              <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} begin={begin} />
            </circle>
            <circle r={2.4} fill={color}>
              <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} begin={begin} />
            </circle>
          </g>
        );
      })}
    </g>
  );
});

/** Draggable bend points, plus a "+" on every segment to add one. Double-click a point to remove it. */
function BendHandles({ edge, vertices }: { edge: DesignEdge; vertices: Pt[] }) {
  const rf = useReactFlow();
  const vt = useViewTransform();
  /** `edge.points` here are in view coordinates; the store keeps model coordinates. */
  const save = (points: Pt[], record: boolean) => useDesign.getState().styleEdge(edge.id, { points: points.map(vt.fromView) }, record);

  /**
   * Drag a bend point, or drag a "+" to create one. A "+" only becomes a bend once the pointer
   * has moved a few pixels, so clicks and double-clicks on the middle of a link still work.
   */
  const drag = (e: ReactPointerEvent, index: number, insert: boolean) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const store = useDesign.getState();
    const start = { x: e.clientX, y: e.clientY };
    let points = [...(edge.points ?? [])];
    let active = !insert;
    if (active) store.snapshot();
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        active = true;
        store.snapshot();
        points.splice(index, 0, snap(rf.screenToFlowPosition(start)));
      }
      const p = snap(rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY }));
      points = points.map((q, i) => (i === index ? p : q));
      save(points, false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const remove = (index: number) => save((edge.points ?? []).filter((_, i) => i !== index), true);

  const dot = 'nodrag nopan pointer-events-auto absolute rounded-full border-2 border-ok';
  return (
    <>
      {(edge.points ?? []).map((p, i) => (
        <div
          key={`p${i}`}
          className={`${dot} h-3 w-3 cursor-move bg-bg`}
          style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
          onPointerDown={(e) => drag(e, i, false)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            remove(i);
          }}
          title="Drag to reroute · double-click to remove"
        />
      ))}
      {vertices.slice(0, -1).map((a, i) => {
        const b = vertices[i + 1];
        return (
          <div
            key={`m${i}`}
            className={`${dot} flex h-3.5 w-3.5 cursor-copy items-center justify-center border-ok/50 bg-panel text-[9px] leading-none text-ok opacity-60 hover:opacity-100`}
            style={{ transform: `translate(-50%, -50%) translate(${(a.x + b.x) / 2}px, ${(a.y + b.y) / 2}px)` }}
            onPointerDown={(e) => drag(e, i, true)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              useDesign.getState().setEditingEdge(edge.id);
            }}
            title="Drag to add a bend · double-click to label"
          >
            +
          </div>
        );
      })}
    </>
  );
}

function LabelEditor({ edge, at }: { edge: DesignEdge; at: Pt }) {
  const [value, setValue] = useState(edge.label ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const done = (save: boolean) => {
    const store = useDesign.getState();
    if (save && value !== (edge.label ?? '')) store.styleEdge(edge.id, { label: value.trim() || undefined });
    store.setEditingEdge(null);
  };
  return (
    <input
      ref={ref}
      className="nodrag nopan pointer-events-auto absolute w-40 rounded-md border border-ok/60 bg-bg px-2 py-0.5 text-center text-xs text-text outline-none"
      style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
      value={value}
      placeholder="Label"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      }}
      aria-label="Link label"
    />
  );
}

function TrafficEdgeImpl(props: EdgeProps<TrafficFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd, markerStart } = props;
  const edge = data!.edge;
  const isTraffic = (edge.kind ?? 'traffic') === 'traffic';
  const geo = edgeGeometry({
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    sourcePosition,
    targetPosition,
    points: edge.points,
    style: edge.pathStyle,
  });
  const [hover, setHover] = useState(false);
  const editing = useDesign((s) => s.editingEdgeId === id);

  const running = useLive((s) => s.status !== 'stopped');
  const er = useLive((s) => (isTraffic ? s.tick?.edges[id] : undefined));
  const targetLatency = useLive((s) => (isTraffic ? (s.tick?.nodes[data!.targetId]?.latencyMs ?? 0) : 0));
  const targetStatus = useLive((s) => (isTraffic ? s.tick?.nodes[data!.targetId]?.status : undefined));

  const rps = er?.rps ?? 0;
  const failing = er?.failingRps ?? 0;
  const mode = er?.partitioned ? 'partition' : er?.breakerOpen ? 'breaker' : 'normal';
  const targetDown = targetStatus === 'down' || targetStatus === 'failing_over';
  const bad = targetDown || failing / Math.max(rps + failing, 1e-9) > 0.2;
  const flow = rps + (mode === 'normal' ? failing : 0);
  const count = isTraffic && running && mode === 'normal' ? clamp(Math.round(Math.log10(flow + 1) * 2), 0, 8) : 0;
  const hop = (edge.latencyMs ?? 1) + (er?.extraLatencyMs ?? 0);
  const dur = Math.round(clamp(0.5 + (hop + targetLatency) / 300, 0.5, 4) * 4) / 4;
  const color = bad ? COLORS.bad : (er?.extraLatencyMs ?? 0) > 0 ? COLORS.warn : COLORS.ok;

  const stroke = data?.invalid || mode === 'partition' ? COLORS.bad : mode === 'breaker' ? COLORS.warn : selected ? COLORS.ok : isTraffic ? '#2a3347' : '#56607a';
  const dashed = mode !== 'normal' || !isTraffic || edge.dashed;
  const width = isTraffic ? (data?.split ? 1.25 : 2) : 1.25;

  return (
    <>
      <BaseEdge
        id={id}
        path={geo.d}
        markerEnd={markerEnd}
        markerStart={markerStart}
        className="br-edge-base"
        interactionWidth={18}
        style={{
          stroke,
          strokeWidth: width,
          strokeDasharray: dashed ? '6 5' : undefined,
          strokeOpacity: isTraffic && running && mode === 'normal' ? 0.35 + Math.min(count, 8) * 0.06 : 0.9,
        }}
      />
      <path d={geo.d} fill="none" stroke="transparent" strokeWidth={18} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />
      <Particles path={geo.d} count={count} color={color} dur={dur} />
      <EdgeLabelRenderer>
        {editing ? (
          <LabelEditor edge={edge} at={geo.label} />
        ) : (
          edge.label && (
            <div
              className="nodrag nopan pointer-events-auto absolute max-w-[220px] cursor-pointer truncate rounded-md border border-line bg-bg/95 px-2 py-0.5 text-center text-[11px] text-text"
              style={{ transform: `translate(-50%, -50%) translate(${geo.label.x}px, ${geo.label.y}px)`, borderColor: selected ? COLORS.ok : undefined }}
              onClick={(e) => {
                e.stopPropagation();
                useDesign.getState().select(null, id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (data?.editable) useDesign.getState().setEditingEdge(id);
              }}
            >
              {edge.label}
            </div>
          )
        )}
        {isTraffic && running && mode !== 'normal' && (
          <div
            className="nodrag nopan pointer-events-none absolute flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              transform: `translate(-50%, -50%) translate(${geo.label.x}px, ${geo.label.y + (edge.label ? 20 : 0)}px)`,
              borderColor: mode === 'partition' ? COLORS.bad : COLORS.warn,
              color: mode === 'partition' ? COLORS.bad : COLORS.warn,
              background: '#07090f',
            }}
          >
            {mode === 'partition' ? <Scissors size={10} /> : <Zap size={10} />}
            {mode === 'partition' ? 'PARTITION' : 'OPEN'}
          </div>
        )}
        {hover && !editing && (
          <div
            className="nodrag nopan pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-text shadow-lg"
            style={{ transform: `translate(-50%, -170%) translate(${geo.label.x}px, ${geo.label.y}px)` }}
          >
            {!isTraffic ? (
              'Drawing only: not simulated'
            ) : running ? (
              <span className="font-num">
                {fmtRps(rps)} rps · {fmtMs(hop)}
                {failing > 0 && <span className="text-bad"> · {fmtRps(failing)} failing</span>}
              </span>
            ) : data?.split ? (
              'Split: each request goes to one target'
            ) : (
              `Fan-out: ${Math.round(Math.min(1, edge.weight ?? 1) * 100)}% of requests make this call`
            )}
          </div>
        )}
        {selected && data?.editable && !editing && <BendHandles edge={edge} vertices={geo.vertices} />}
      </EdgeLabelRenderer>
    </>
  );
}

export const TrafficEdge = memo(TrafficEdgeImpl);
