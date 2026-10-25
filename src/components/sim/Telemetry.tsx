import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SimEvent } from '@/core';
import { fmtClock, fmtMs } from '@/lib/format';
import { COLORS } from '@/lib/kinds';
import type { HistoryPoint } from '@/stores/simStore';

const LEVEL_COLOR = { info: COLORS.ok, warn: COLORS.warn, critical: COLORS.bad };

export function MiniChart({
  data,
  dataKey,
  color,
  unit,
  title,
  goal,
}: {
  data: HistoryPoint[];
  dataKey: keyof HistoryPoint;
  color: string;
  unit: string;
  title: string;
  goal?: number;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className="h-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1c2333" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t) => fmtClock(t)} stroke="#7b8499" fontSize={10} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis
              stroke="#7b8499"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={52}
              domain={[0, (max: number) => (unit === '%' ? Math.max(max, 2) : Math.max(max, 100))]}
              tickFormatter={(v: number) => (unit === 'ms' ? fmtMs(v) : `${+v.toFixed(1)}%`)}
            />
            <Tooltip
              contentStyle={{ background: '#0d111a', border: '1px solid #1c2333', borderRadius: 6, fontSize: 11 }}
              labelFormatter={(t) => fmtClock(Number(t))}
              formatter={(v: number) => [`${v.toFixed(unit === '%' ? 2 : 0)}${unit}`, title]}
            />
            {goal !== undefined && <ReferenceLine y={goal} stroke={COLORS.good} strokeDasharray="4 4" />}
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function IncidentLog({ events, onSelect }: { events: SimEvent[]; onSelect?: (e: SimEvent) => void }) {
  if (!events.length) return <div className="p-3 text-xs text-muted">No incidents yet. Right-click a component to break it.</div>;
  return (
    <ul className="divide-y divide-line/60">
      {events.map((e, i) => (
        <li key={`${e.t}-${i}`}>
          <button className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-panel2" onClick={() => onSelect?.(e)}>
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[e.level] }} />
            <span className="font-num text-muted">{fmtClock(e.t)}</span>
            <span className="text-text">{e.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Telemetry({ history, events, onSelectEvent }: { history: HistoryPoint[]; events: SimEvent[]; onSelectEvent?: (e: SimEvent) => void }) {
  return (
    <div className="grid h-full grid-cols-1 gap-4 p-3 lg:grid-cols-[1fr_1fr_minmax(260px,0.9fr)]">
      <MiniChart data={history} dataKey="p99" color={COLORS.ok} unit="ms" title="p99 latency" />
      <MiniChart data={history} dataKey="errorPct" color={COLORS.bad} unit="%" title="Error rate" />
      <div className="min-h-0 overflow-hidden rounded-md border border-line">
        <div className="border-b border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Incident log</div>
        <div className="h-[118px] overflow-y-auto">
          <IncidentLog events={events} onSelect={onSelectEvent} />
        </div>
      </div>
    </div>
  );
}
