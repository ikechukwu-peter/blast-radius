import { useEffect, useState } from 'react';
import { SCENARIOS } from '@/core';
import { readLocalResults, topScores, type LocalResult } from '@/lib/api';
import { ScenarioCard } from '@/components/ScenarioCard';

export default function ChallengesPage() {
  const [top, setTop] = useState<Record<string, number>>({});
  const [mine] = useState<Record<string, LocalResult>>(readLocalResults);
  useEffect(() => {
    topScores().then(setTop).catch(() => {});
  }, []);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="max-w-2xl">
        <div className="font-num text-xs uppercase tracking-widest text-ok">Challenges</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Think your architecture survives? Prove it.</h1>
        <p className="mt-3 text-muted">
          Each scenario runs a scripted incident against your design. Stay within the latency and error SLOs for the whole run, under budget. Scores are deterministic: the same design always gets the same score.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SCENARIOS.map((s) => (
          <ScenarioCard key={s.id} scenario={s} top={top[s.id]} mine={mine[s.id]} />
        ))}
      </div>
    </div>
  );
}
