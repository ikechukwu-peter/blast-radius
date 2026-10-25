import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FastForward, Loader2, Pencil, Play, RotateCcw, Send, Trophy } from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  KIND_LABELS,
  SCENARIOS,
  TEMPLATES,
  missingKinds,
  resolveScenarioAction,
  runScenario,
  type Design,
  type ScenarioResult,
} from '@/core';
import { createDesign, listMyDesigns, saveLocalResult, submitRun } from '@/lib/api';
import { fmtClock, fmtMs, fmtPct, fmtUsd } from '@/lib/format';
import { COLORS } from '@/lib/kinds';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/stores/authStore';
import { readDraft, useDesign } from '@/stores/designStore';
import { createSimStore, LiveContext, useSim } from '@/stores/simStore';
import { toast } from '@/stores/toastStore';
import { FlowCanvas } from '@/components/editor/FlowCanvas';
import { LiveStrip } from '@/components/sim/LiveStrip';
import NotFound from './NotFound';

interface Choice {
  key: string;
  label: string;
  group: 'Draft' | 'My designs' | 'Templates';
  title: string;
  design: Design;
  designId?: string;
}

function useCountUp(target: number, run: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return setV(0);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setV(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return v;
}

function failingRanges(result: ScenarioResult) {
  const ranges: [number, number][] = [];
  let start: number | null = null;
  for (const s of result.seconds) {
    if (!s.withinSlo && start === null) start = s.t - 1;
    if (s.withinSlo && start !== null) {
      ranges.push([start, s.t - 1]);
      start = null;
    }
  }
  if (start !== null) ranges.push([start, result.seconds[result.seconds.length - 1]?.t ?? start]);
  return ranges;
}

export default function ChallengeRunPage() {
  const { scenarioId } = useParams();
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const store = useMemo(() => createSimStore(), []);
  const status = useSim(store, (s) => s.status);
  const elapsed = useSim(store, (s) => s.elapsed);
  const metrics = useSim(store, (s) => s.tick?.metrics);

  const [choices, setChoices] = useState<Choice[]>([]);
  const [choiceKey, setChoiceKey] = useState<string>('');
  const [phase, setPhase] = useState<'brief' | 'running' | 'results'>('brief');
  const [caption, setCaption] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const captionTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => store.getState().reset(), [store]);

  useEffect(() => {
    const list: Choice[] = [];
    const draft = readDraft();
    if (draft?.design.nodes.length) list.push({ key: 'draft', label: `${draft.title} (current draft)`, group: 'Draft', title: draft.title, design: draft.design });
    for (const t of TEMPLATES) list.push({ key: `t:${t.id}`, label: t.title, group: 'Templates', title: t.title, design: t.design });
    setChoices(list);
    setChoiceKey((k) => k || list[0]?.key || '');
    if (user && isSupabaseConfigured) {
      listMyDesigns(user.id)
        .then((rows) => {
          const mine: Choice[] = rows.map((r) => ({ key: `d:${r.id}`, label: r.title, group: 'My designs', title: r.title, design: r.graph, designId: r.id }));
          setChoices([...list.filter((c) => c.group === 'Draft'), ...mine, ...list.filter((c) => c.group === 'Templates')]);
        })
        .catch(() => {});
    }
  }, [user]);

  const choice = choices.find((c) => c.key === choiceKey);
  const missing = scenario && choice ? missingKinds(choice.design, scenario) : [];
  const score = useCountUp(result?.score ?? 0, phase === 'results');

  if (!scenario) return <NotFound />;

  const finish = (design: Design) => {
    setTimeout(() => {
      const r = runScenario(design, scenario);
      setResult(r);
      setPhase('results');
      saveLocalResult(scenario.id, { score: r.score, survived: r.survived, at: new Date().toISOString() });
    }, 30);
  };

  const run = () => {
    if (!choice || missing.length) return;
    setResult(null);
    setSubmitted(null);
    setPhase('running');
    const design = choice.design;
    store.getState().play(design, {
      seed: 1337,
      samplesPerTick: 120,
      warmupTicks: 100,
      speed: 4,
      durationSec: scenario.durationSec,
      timeline: scenario.timeline.map((i) => ({ atSec: i.atSec, caption: i.caption, actions: resolveScenarioAction(design, i.action) })),
      onCaption: (c) => {
        setCaption(c);
        clearTimeout(captionTimer.current);
        captionTimer.current = setTimeout(() => setCaption(null), 2500);
      },
      onFinish: () => finish(design),
    });
  };

  const skip = () => {
    if (!choice) return;
    store.getState().pause();
    finish(choice.design);
  };

  const submit = async () => {
    if (!choice || !user) return;
    setSubmitting(true);
    try {
      let designId = choice.designId;
      if (!designId) {
        const row = await createDesign({ title: choice.title, graph: choice.design });
        designId = row.id;
        const saved: Choice = { ...choice, key: `d:${row.id}`, group: 'My designs', designId: row.id };
        setChoices((cs) => [saved, ...cs.filter((c) => c.key !== choice.key)]);
        setChoiceKey(saved.key);
      }
      const res = await submitRun(designId, scenario.id);
      setSubmitted(res.result.score);
      toast(`Submitted: ${res.result.score} points (verified on the server)`, 'success', 4500);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Submission failed', 'error', 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const editDesign = () => {
    if (!choice) return;
    if (choice.designId) return navigate(`/d/${choice.designId}`);
    useDesign.getState().loadDesign(choice.design, { source: 'draft', title: choice.title });
    try {
      localStorage.setItem('br:draft', JSON.stringify({ title: choice.title, design: choice.design }));
    } catch {
      /* ignore */
    }
    navigate('/play');
  };

  const progress = Math.min(1, elapsed / scenario.durationSec);
  const groups = (['Draft', 'My designs', 'Templates'] as const).map((g) => ({ g, items: choices.filter((c) => c.group === g) })).filter((x) => x.items.length);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/challenges" className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> All challenges
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{scenario.title}</h1>
          <p className="mt-2 max-w-2xl text-muted">{scenario.briefing}</p>

          {/* Stage */}
          <div className="panel relative mt-6 h-[420px] overflow-hidden">
            {choice ? (
              <LiveContext.Provider value={store}>
                <FlowCanvas design={choice.design} fitKey={choice.key} showMinimap={false} />
              </LiveContext.Provider>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">Pick a design to run.</div>
            )}
            {phase !== 'brief' && (
              <div className="absolute inset-x-0 top-0 h-1 bg-line">
                <div className="h-full bg-ok transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
                {scenario.timeline.map((t) => (
                  <span key={t.atSec} className="absolute top-0 h-2 w-0.5 bg-warn" style={{ left: `${(t.atSec / scenario.durationSec) * 100}%` }} title={t.caption} />
                ))}
              </div>
            )}
            {caption && (
              <div className="br-toast absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-warn/50 bg-bg/90 px-3 py-1 text-sm font-medium text-warn backdrop-blur">
                {caption}
              </div>
            )}
            {phase === 'running' && (
              <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-bg/85 px-3 py-2 backdrop-blur">
                <span className="font-num text-sm text-muted">
                  {fmtClock(elapsed)} / {fmtClock(scenario.durationSec)} · 4x
                </span>
                <LiveStrip metrics={metrics} goals={scenario.goals} compact />
                <button className="btn text-xs" onClick={skip}>
                  <FastForward size={13} /> Skip to results
                </button>
              </div>
            )}
          </div>

          {/* Results */}
          {phase === 'results' && result && (
            <div className="panel mt-6 p-5">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Score</div>
                  <div className="font-num text-5xl font-semibold">
                    {score}
                    <span className="text-xl text-muted">/1000</span>
                  </div>
                </div>
                <span className={`chip px-3 py-1 text-sm ${result.survived ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>{result.survived ? 'Survived' : 'Failed'}</span>
                <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted">Within SLO</dt>
                    <dd className="font-num">{fmtPct(result.sloAttainment, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Worst p99</dt>
                    <dd className="font-num" style={{ color: result.worstP99Ms > scenario.goals.maxP99Ms ? COLORS.bad : undefined }}>
                      {fmtMs(result.worstP99Ms)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Avg errors</dt>
                    <dd className="font-num">{fmtPct(result.avgErrorRate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Cost / budget</dt>
                    <dd className="font-num" style={{ color: result.overBudget ? COLORS.bad : undefined }}>
                      {fmtUsd(result.monthlyCostUsd)} / {fmtUsd(scenario.goals.maxMonthlyCostUsd)}
                    </dd>
                  </div>
                </dl>
              </div>
              {!result.survived && (
                <p className="mt-3 text-sm text-muted">
                  {result.overBudget
                    ? 'Over budget: reliability has to be affordable. Trim idle capacity.'
                    : `You need ${fmtPct(scenario.minSloAttainment, 0)} of seconds within SLO to survive. The red bands show where it broke.`}
                </p>
              )}
              <div className="mt-5 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={result.seconds.map((s) => ({ t: s.t, p99: Math.round(s.metrics.p99Ms), err: +(s.metrics.errorRate * 100).toFixed(2) }))} margin={{ top: 6, right: 4, left: -6, bottom: 0 }}>
                    <CartesianGrid stroke="#1c2333" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" stroke="#7b8499" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(t) => `${t}s`} minTickGap={30} />
                    <YAxis yAxisId="ms" stroke="#7b8499" fontSize={10} tickLine={false} axisLine={false} width={56} domain={[0, (max: number) => Math.ceil(Math.max(max, scenario.goals.maxP99Ms * 1.25))]} tickFormatter={(v) => fmtMs(v)} />
                    <YAxis yAxisId="pct" orientation="right" stroke="#7b8499" fontSize={10} tickLine={false} axisLine={false} width={44} domain={[0, (max: number) => Math.max(max, scenario.goals.maxErrorRate * 100 * 1.5)]} tickFormatter={(v) => `${+v.toFixed(1)}%`} />
                    {failingRanges(result).map(([a, b]) => (
                      <ReferenceArea key={a} yAxisId="ms" x1={a} x2={b} fill={COLORS.bad} fillOpacity={0.12} strokeOpacity={0} />
                    ))}
                    <ReferenceLine yAxisId="ms" y={scenario.goals.maxP99Ms} stroke={COLORS.ok} strokeDasharray="4 4" />
                    <ReferenceLine yAxisId="pct" y={scenario.goals.maxErrorRate * 100} stroke={COLORS.bad} strokeDasharray="4 4" />
                    <Tooltip contentStyle={{ background: '#0d111a', border: '1px solid #1c2333', borderRadius: 6, fontSize: 11 }} labelFormatter={(t) => `t=${t}s`} />
                    <Line yAxisId="ms" dataKey="p99" name="p99 (ms)" stroke={COLORS.ok} dot={false} strokeWidth={1.75} isAnimationActive={false} />
                    <Line yAxisId="pct" dataKey="err" name="errors (%)" stroke={COLORS.bad} dot={false} strokeWidth={1.75} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex gap-4 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 bg-ok" /> p99 (dashed = goal)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 bg-bad" /> errors (dashed = goal)
                </span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn" onClick={run}>
                  <RotateCcw size={14} /> Retry
                </button>
                <button className="btn" onClick={editDesign}>
                  <Pencil size={14} /> Edit design
                </button>
                {isSupabaseConfigured &&
                  (user ? (
                    <button className="btn-primary" onClick={submit} disabled={submitting || submitted !== null}>
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {submitted !== null ? `Submitted (${submitted})` : choice?.designId ? 'Submit to leaderboard' : 'Save & submit'}
                    </button>
                  ) : (
                    <Link to={`/auth?next=/challenges/${scenario.id}`} className="btn-primary">
                      <Trophy size={14} /> Sign in to submit
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="panel p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Goals</div>
            <ul className="mt-2 space-y-1.5 font-num text-sm">
              <li>p99 ≤ {fmtMs(scenario.goals.maxP99Ms)}</li>
              <li>errors ≤ {scenario.goals.maxErrorRate * 100}%</li>
              <li>cost ≤ {fmtUsd(scenario.goals.maxMonthlyCostUsd)}/mo</li>
              <li className="text-muted">
                survive: {fmtPct(scenario.minSloAttainment, 0)} of {scenario.durationSec}s within SLO
              </li>
            </ul>
            <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Timeline</div>
            <ol className="mt-2 space-y-1 text-sm">
              {scenario.timeline.map((t) => (
                <li key={t.atSec} className="flex gap-2">
                  <span className="w-9 shrink-0 font-num text-muted">{t.atSec}s</span>
                  <span>{t.caption}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="panel p-4">
            <label className="block">
              <span className="label">Design to run</span>
              <select className="input" value={choiceKey} disabled={status === 'running'} onChange={(e) => { setChoiceKey(e.target.value); setPhase('brief'); store.getState().reset(); }}>
                {groups.map(({ g, items }) => (
                  <optgroup key={g} label={g}>
                    {items.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {missing.length > 0 && (
              <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-2.5 text-xs text-warn">
                This scenario needs: {missing.map((k) => KIND_LABELS[k]).join(', ')}.
                <button className="mt-1 block underline" onClick={editDesign}>
                  Open in editor
                </button>
              </div>
            )}
            <button className="btn-primary mt-3 w-full py-2" disabled={!choice || missing.length > 0 || status === 'running'} onClick={run}>
              <Play size={14} /> {phase === 'brief' ? 'Run challenge' : 'Run again'}
            </button>
            <p className="mt-2 text-[11px] text-muted">Plays at 4x speed. The score comes from the same seeded simulation, so it is reproducible.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
