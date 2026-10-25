import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SCENARIOS } from '@/core';
import { getLeaderboard, publicSlugs, type LeaderboardRow } from '@/lib/api';
import { fmtDate, fmtMs, fmtUsd } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/stores/authStore';
import { TableSkeleton } from '@/components/ui/Skeleton';

const MEDAL = ['#fbbf24', '#cbd5e1', '#d97706'];

export default function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const active = SCENARIOS.find((s) => s.id === params.get('s')) ?? SCENARIOS[0];
  const user = useAuth((s) => s.user);
  // Results are keyed by scenario, so switching tabs shows the skeleton until that tab's data lands.
  const [data, setData] = useState<{ scenarioId: string; rows: LeaderboardRow[] | null; slugs: Record<string, string>; error: boolean } | null>(null);
  const current = data?.scenarioId === active.id ? data : null;
  const rows = current?.rows ?? null;
  const slugs = current?.slugs ?? {};
  const error = current?.error ?? false;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    getLeaderboard(active.id)
      .then(async (r) => {
        const s = await publicSlugs(r.map((x) => x.design_id).filter((x): x is string => !!x));
        if (!cancelled) setData({ scenarioId: active.id, rows: r, slugs: s, error: false });
      })
      .catch(() => !cancelled && setData({ scenarioId: active.id, rows: null, slugs: {}, error: true }));
    return () => {
      cancelled = true;
    };
  }, [active.id]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-2 text-muted">Every score is re-computed on the server from the submitted design. Ties go to the cheaper architecture.</p>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === active.id}
            onClick={() => setParams({ s: s.id })}
            className={`whitespace-nowrap px-3 py-2 text-sm ${s.id === active.id ? 'border-b-2 border-ok text-text' : 'text-muted hover:text-text'}`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {!isSupabaseConfigured ? (
        <div className="mt-8 rounded-lg border border-dashed border-line p-10 text-center text-muted">The leaderboard needs a Supabase project (see README). Challenges still work locally.</div>
      ) : error ? (
        <div className="mt-8 text-center text-bad">Could not load the leaderboard.</div>
      ) : rows === null ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-line p-10 text-center text-muted">
          No scores yet.{' '}
          <Link to={`/challenges/${active.id}`} className="text-ok underline">
            Be the first
          </Link>
          .
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pl-3 font-medium">#</th>
                <th className="py-2 font-medium">Engineer</th>
                <th className="py-2 text-right font-medium">Score</th>
                <th className="py-2 text-center font-medium">Result</th>
                <th className="py-2 text-right font-medium">Worst p99</th>
                <th className="py-2 text-right font-medium">$/mo</th>
                <th className="py-2 pr-3 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const slug = r.design_id ? slugs[r.design_id] : undefined;
                const name = r.display_name ?? r.username ?? 'Anonymous';
                const cells = (
                  <>
                    <td className="py-2.5 pl-3 font-num" style={{ color: MEDAL[i] }}>
                      {i + 1}
                    </td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-panel2 text-[10px]">
                          {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1)}
                        </span>
                        {slug ? (
                          <Link to={`/s/${slug}`} className="hover:text-ok hover:underline">
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-num font-semibold">{r.score}</td>
                    <td className="py-2.5 text-center">
                      <span className={`chip ${r.survived ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>{r.survived ? 'Survived' : 'Failed'}</span>
                    </td>
                    <td className="py-2.5 text-right font-num text-muted">{fmtMs(Number(r.worst_p99_ms))}</td>
                    <td className="py-2.5 text-right font-num text-muted">{fmtUsd(Number(r.monthly_cost_usd))}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">{fmtDate(r.created_at)}</td>
                  </>
                );
                return (
                  <tr key={r.user_id} className={`border-t border-line ${r.user_id === user?.id ? 'bg-ok/5' : ''}`}>
                    {cells}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
