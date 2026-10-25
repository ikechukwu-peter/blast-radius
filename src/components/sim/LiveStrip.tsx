import type { Metrics } from '@/core';
import { fmtMs, fmtPct, fmtRps } from '@/lib/format';
import { COLORS } from '@/lib/kinds';

export interface Goals {
  maxP99Ms: number;
  maxErrorRate: number;
}

function Stat({ label, value, color, wide }: { label: string; value: string; color?: string; wide?: boolean }) {
  return (
    <div className={`min-w-[56px] sm:min-w-[64px] ${wide ? 'hidden sm:block' : ''}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="font-num text-sm font-medium" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export function LiveStrip({ metrics, goals, compact = false }: { metrics: Metrics | null | undefined; goals?: Goals; compact?: boolean }) {
  const m = metrics;
  const errColor = !m
    ? undefined
    : goals
      ? m.errorRate <= goals.maxErrorRate
        ? COLORS.good
        : COLORS.bad
      : m.errorRate > 0.05
        ? COLORS.bad
        : m.errorRate > 0.01
          ? COLORS.warn
          : undefined;
  const p99Color = !m
    ? undefined
    : goals
      ? m.p99Ms <= goals.maxP99Ms
        ? COLORS.good
        : COLORS.bad
      : m.p99Ms > 1000
        ? COLORS.bad
        : m.p99Ms > 500
          ? COLORS.warn
          : undefined;
  return (
    <div className={`flex items-center gap-4 ${compact ? 'gap-3' : 'sm:gap-6'}`}>
      {!compact && <Stat wide label="Offered" value={m ? `${fmtRps(m.offeredRps)}/s` : '–'} />}
      <Stat label="Throughput" value={m ? `${fmtRps(m.throughputRps)}/s` : '–'} />
      <Stat label="Errors" value={m ? fmtPct(m.errorRate) : '–'} color={errColor} />
      {!compact && <Stat wide label="p50" value={m ? fmtMs(m.p50Ms) : '–'} />}
      {!compact && <Stat wide label="p95" value={m ? fmtMs(m.p95Ms) : '–'} />}
      <Stat label="p99" value={m ? fmtMs(m.p99Ms) : '–'} color={p99Color} />
    </div>
  );
}
