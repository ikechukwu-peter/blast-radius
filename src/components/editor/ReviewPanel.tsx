import { Play } from 'lucide-react';
import { ReviewSkeleton } from '@/components/ui/Skeleton';
import type { Finding, Review, Severity } from '@/core';
import { fmtMs, fmtPct, fmtUsd } from '@/lib/format';
import { SEVERITY_COLOR, gradeColor } from '@/lib/grades';

export function GradeBadge({ review, onClick }: { review: Review | null; onClick?: () => void }) {
  if (!review) return null;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-num text-xs hover:border-muted/60"
      title="Design review"
    >
      <span className="font-display text-sm font-bold" style={{ color: gradeColor(review.grade) }}>
        {review.grade}
      </span>
      <span className="text-muted">{review.score}</span>
    </button>
  );
}

export function ReviewPanel({ review, onFindingClick, onStart }: { review: Review | null; onFindingClick: (f: Finding) => void; onStart?: () => void }) {
  if (!review) {
    return <ReviewSkeleton />;
  }
  const groups = (['critical', 'high', 'medium', 'low', 'info'] as Severity[])
    .map((sev) => ({ sev, items: review.findings.filter((f) => f.severity === sev) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-4">
        <div className="font-display text-6xl font-bold leading-none" style={{ color: gradeColor(review.grade) }}>
          {review.grade}
        </div>
        <div className="space-y-1 text-xs text-muted">
          <div>
            Score <span className="font-num text-text">{review.score}</span>/100
          </div>
          <div>
            Cost <span className="font-num text-text">{fmtUsd(review.monthlyCostUsd)}</span>/mo
          </div>
          {review.baseline && (
            <div>
              Baseline p99 <span className="font-num text-text">{fmtMs(review.baseline.p99Ms)}</span> · errors{' '}
              <span className="font-num text-text">{fmtPct(review.baseline.errorRate)}</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted/80">Deterministic review: graph analysis plus a 30s headless simulation. No AI.</p>

      {review.findings.length === 0 ? (
        <div className="rounded-lg border border-good/30 bg-good/5 p-4 text-center">
          <p className="text-sm text-text">No issues found. Now try to break it.</p>
          {onStart && (
            <button className="btn-primary mt-3" onClick={onStart}>
              <Play size={14} /> Run simulation
            </button>
          )}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.sev}>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: SEVERITY_COLOR[g.sev] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[g.sev] }} />
              {g.sev} · {g.items.length}
            </div>
            <div className="space-y-2">
              {g.items.map((f, i) => (
                <button
                  key={`${f.ruleId}-${i}`}
                  onClick={() => onFindingClick(f)}
                  className="block w-full rounded-md border border-line bg-panel2/50 p-3 text-left transition-colors hover:border-muted/60"
                >
                  <div className="text-[13px] font-semibold text-text">{f.title}</div>
                  <div className="mt-1 text-xs text-muted">{f.detail}</div>
                  <div className="mt-1.5 text-xs text-ok">Fix: {f.fix}</div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
