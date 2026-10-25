import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { Scissors, Zap } from 'lucide-react';
import type { DesignEdge } from '@/core';
import { clamp, fmtMs, fmtRps } from '@/lib/format';
import { COLORS } from '@/lib/kinds';
import { useLive } from '@/stores/simStore';

export type TrafficEdgeData = {
  edge: DesignEdge;
  split: boolean;
  targetId: string;
  invalid?: boolean;
};
export type TrafficFlowEdge = Edge<TrafficEdgeData, 'traffic'>;

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

function TrafficEdgeImpl(props: EdgeProps<TrafficFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const [hover, setHover] = useState(false);

  const running = useLive((s) => s.status !== 'stopped');
  const er = useLive((s) => s.tick?.edges[id]);
  const targetLatency = useLive((s) => (data ? (s.tick?.nodes[data.targetId]?.latencyMs ?? 0) : 0));
  const targetStatus = useLive((s) => (data ? s.tick?.nodes[data.targetId]?.status : undefined));

  const rps = er?.rps ?? 0;
  const failing = er?.failingRps ?? 0;
  const mode = er?.partitioned ? 'partition' : er?.breakerOpen ? 'breaker' : 'normal';
  const targetDown = targetStatus === 'down' || targetStatus === 'failing_over';
  const bad = targetDown || failing / Math.max(rps + failing, 1e-9) > 0.2;
  const flow = rps + (mode === 'normal' ? failing : 0);
  const count = running && mode === 'normal' ? clamp(Math.round(Math.log10(flow + 1) * 2), 0, 8) : 0;
  const hop = (data?.edge.latencyMs ?? 1) + (er?.extraLatencyMs ?? 0);
  const dur = Math.round(clamp(0.5 + (hop + targetLatency) / 300, 0.5, 4) * 4) / 4;
  const color = bad ? COLORS.bad : (er?.extraLatencyMs ?? 0) > 0 ? COLORS.warn : COLORS.ok;

  const stroke =
    data?.invalid || mode === 'partition' ? COLORS.bad : mode === 'breaker' ? COLORS.warn : selected ? COLORS.ok : '#2a3347';
  const dashed = mode !== 'normal';
  const width = data?.split ? 1.25 : 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className="br-edge-base"
        interactionWidth={18}
        style={{
          stroke,
          strokeWidth: width,
          strokeDasharray: dashed ? '6 5' : undefined,
          strokeOpacity: running && mode === 'normal' ? 0.35 + Math.min(count, 8) * 0.06 : 0.9,
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <Particles path={path} count={count} color={color} dur={dur} />
      <EdgeLabelRenderer>
        {running && mode !== 'normal' && (
          <div
            className="nodrag nopan pointer-events-none absolute flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              borderColor: mode === 'partition' ? COLORS.bad : COLORS.warn,
              color: mode === 'partition' ? COLORS.bad : COLORS.warn,
              background: '#07090f',
            }}
          >
            {mode === 'partition' ? <Scissors size={10} /> : <Zap size={10} />}
            {mode === 'partition' ? 'PARTITION' : 'OPEN'}
          </div>
        )}
        {hover && (
          <div
            className="nodrag nopan pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-text shadow-lg"
            style={{ transform: `translate(-50%, -150%) translate(${labelX}px, ${labelY}px)` }}
          >
            {running ? (
              <span className="font-num">
                {fmtRps(rps)} rps · {fmtMs(hop)}
                {failing > 0 && <span className="text-bad"> · {fmtRps(failing)} failing</span>}
              </span>
            ) : data?.split ? (
              'Split: each request goes to one target'
            ) : (
              `Fan-out: ${Math.round(Math.min(1, data?.edge.weight ?? 1) * 100)}% of requests make this call`
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const TrafficEdge = memo(TrafficEdgeImpl);
