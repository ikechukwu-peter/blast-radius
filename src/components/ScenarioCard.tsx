import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import type { Scenario } from '@/core';
import { fmtMs, fmtUsd } from '@/lib/format';
import { KIND_ICONS } from '@/lib/kinds';

export function ScenarioCard({ scenario, top, mine }: { scenario: Scenario; top?: number; mine?: { score: number; survived: boolean } }) {
  return (
    <Link
      to={`/challenges/${scenario.id}`}
      className="panel group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-ok/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{scenario.title}</h3>
        <span className="flex items-center gap-1 font-num text-xs text-muted">
          <Clock size={12} /> {scenario.durationSec}s
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{scenario.tagline}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="chip bg-panel2 font-num normal-case text-text">p99 ≤ {fmtMs(scenario.goals.maxP99Ms)}</span>
        <span className="chip bg-panel2 font-num normal-case text-text">errors ≤ {scenario.goals.maxErrorRate * 100}%</span>
        <span className="chip bg-panel2 font-num normal-case text-text">≤ {fmtUsd(scenario.goals.maxMonthlyCostUsd)}/mo</span>
      </div>
      <div className="mt-auto flex items-center justify-between pt-5">
        <div className="flex gap-1.5 text-muted" title="Required components">
          {scenario.requiredKinds.map((k) => {
            const Icon = KIND_ICONS[k];
            return <Icon key={k} size={14} />;
          })}
        </div>
        <div className="flex gap-3 font-num text-xs">
          {mine && <span className={mine.survived ? 'text-good' : 'text-muted'}>You: {mine.score}</span>}
          {top !== undefined && <span className="text-muted">Top: {top}</span>}
        </div>
      </div>
    </Link>
  );
}
