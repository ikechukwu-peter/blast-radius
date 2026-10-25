import { estimateMonthlyCost } from './cost';
import { Simulation } from './engine';
import type { ChaosAction, Design, Metrics, NodeKind, SimEvent } from './types';

/**
 * Challenge scenarios. Actions target nodes/edges by KIND, not id, so one scenario
 * works against any design the player builds.
 */

export type NodeSelector = { kind: NodeKind; which?: 'first' | 'all' };
export type EdgeSelector = { toKind: NodeKind; fromKind?: NodeKind };

export type ScenarioAction =
  | { type: 'kill_instance' | 'outage' | 'degrade' | 'recover'; target: NodeSelector }
  | { type: 'add_latency'; edges: EdgeSelector; ms: number }
  | { type: 'partition' | 'heal'; edges: EdgeSelector }
  | { type: 'traffic'; multiplier: number }
  | { type: 'recover_all' };

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  briefing: string;
  durationSec: number;
  /** The design must contain these kinds for the scenario to be meaningful. */
  requiredKinds: NodeKind[];
  /** Fraction of seconds that must be within SLO to survive. */
  minSloAttainment: number;
  timeline: { atSec: number; action: ScenarioAction; caption: string }[];
  goals: { maxP99Ms: number; maxErrorRate: number; maxMonthlyCostUsd: number };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'black-friday',
    title: 'Black Friday',
    tagline: 'Traffic goes 10x in 60 seconds.',
    briefing: 'Marketing sent the email early. Traffic ramps to 10x and stays there. Survive the rush without bankrupting the company.',
    durationSec: 120,
    requiredKinds: [],
    minSloAttainment: 0.9,
    timeline: [
      { atSec: 15, action: { type: 'traffic', multiplier: 3 }, caption: 'Email lands: 3x traffic' },
      { atSec: 35, action: { type: 'traffic', multiplier: 6 }, caption: 'Goes viral: 6x' },
      { atSec: 55, action: { type: 'traffic', multiplier: 10 }, caption: 'Peak: 10x' },
      { atSec: 100, action: { type: 'traffic', multiplier: 2 }, caption: 'Cooling down' },
    ],
    goals: { maxP99Ms: 500, maxErrorRate: 0.02, maxMonthlyCostUsd: 2500 },
  },
  {
    id: 'primary-down',
    title: 'The Primary Is Gone',
    tagline: 'Your database primary dies mid-afternoon.',
    briefing: 'At 30s the database primary crashes. Does your system fail over, or does it go dark?',
    durationSec: 90,
    requiredKinds: ['database'],
    minSloAttainment: 0.85,
    timeline: [{ atSec: 30, action: { type: 'kill_instance', target: { kind: 'database' } }, caption: 'Database primary crashed' }],
    goals: { maxP99Ms: 400, maxErrorRate: 0.05, maxMonthlyCostUsd: 2500 },
  },
  {
    id: 'slow-provider',
    title: 'The Slow Provider',
    tagline: 'A third-party API starts taking 4 seconds.',
    briefing: 'Your payment provider is having a bad day: every call takes 4s longer. Keep your own users fast.',
    durationSec: 90,
    requiredKinds: ['external_api'],
    minSloAttainment: 0.95,
    timeline: [
      { atSec: 20, action: { type: 'add_latency', edges: { toKind: 'external_api' }, ms: 4000 }, caption: 'Provider latency +4000ms' },
      { atSec: 70, action: { type: 'heal', edges: { toKind: 'external_api' } }, caption: 'Provider recovers' },
    ],
    goals: { maxP99Ms: 600, maxErrorRate: 0.02, maxMonthlyCostUsd: 3000 },
  },
  {
    id: 'cache-meltdown',
    title: 'Cache Meltdown',
    tagline: 'Redis dies. Every read hits Postgres.',
    briefing: 'During peak hours (3x traffic) your cache goes down and every request falls through to the database at once (a thundering herd).',
    durationSec: 90,
    requiredKinds: ['cache', 'database'],
    minSloAttainment: 0.9,
    timeline: [
      { atSec: 5, action: { type: 'traffic', multiplier: 3 }, caption: 'Peak hours: 3x traffic' },
      { atSec: 25, action: { type: 'outage', target: { kind: 'cache', which: 'all' } }, caption: 'Cache cluster down' },
      { atSec: 65, action: { type: 'recover', target: { kind: 'cache', which: 'all' } }, caption: 'Cache back' },
    ],
    goals: { maxP99Ms: 500, maxErrorRate: 0.05, maxMonthlyCostUsd: 3000 },
  },
  {
    id: 'retry-storm',
    title: 'Retry Storm',
    tagline: 'A small slowdown becomes a full outage.',
    briefing: 'API servers degrade while traffic doubles. Aggressive client retries can turn this into a meltdown.',
    durationSec: 90,
    requiredKinds: ['api_server'],
    minSloAttainment: 0.85,
    timeline: [
      { atSec: 20, action: { type: 'traffic', multiplier: 2 }, caption: 'Traffic 2x' },
      { atSec: 25, action: { type: 'degrade', target: { kind: 'api_server', which: 'all' } }, caption: 'API servers degraded' },
      { atSec: 60, action: { type: 'recover', target: { kind: 'api_server', which: 'all' } }, caption: 'API servers recover' },
    ],
    goals: { maxP99Ms: 800, maxErrorRate: 0.1, maxMonthlyCostUsd: 2500 },
  },
];

/** Turns a kind-based scenario action into concrete engine actions for this design. */
export function resolveScenarioAction(design: Design, action: ScenarioAction): ChaosAction[] {
  const kindOf = new Map(design.nodes.map((n) => [n.id, n.kind]));
  switch (action.type) {
    case 'traffic':
      return [{ type: 'traffic', multiplier: action.multiplier }];
    case 'recover_all':
      return [{ type: 'recover_all' }];
    case 'add_latency':
    case 'partition':
    case 'heal': {
      const sel = action.edges;
      const edges = design.edges.filter(
        (e) => kindOf.get(e.target) === sel.toKind && (!sel.fromKind || kindOf.get(e.source) === sel.fromKind),
      );
      return edges.map((e) =>
        action.type === 'add_latency' ? { type: 'add_latency', edgeId: e.id, ms: action.ms } : { type: action.type, edgeId: e.id },
      );
    }
    default: {
      const matches = design.nodes.filter((n) => n.kind === action.target.kind);
      const chosen = action.target.which === 'all' ? matches : matches.slice(0, 1);
      return chosen.map((n) => ({ type: action.type, nodeId: n.id }));
    }
  }
}

export interface ScenarioSecond {
  t: number;
  metrics: Metrics;
  withinSlo: boolean;
}

export interface ScenarioResult {
  scenarioId: string;
  /** False when the design lacks a required component; score is 0. */
  eligible: boolean;
  missingKinds: NodeKind[];
  score: number;
  survived: boolean;
  /** Fraction of seconds within SLO (0..1). */
  sloAttainment: number;
  worstP99Ms: number;
  avgErrorRate: number;
  monthlyCostUsd: number;
  overBudget: boolean;
  seconds: ScenarioSecond[];
  events: SimEvent[];
}

/**
 * Runs a scenario headlessly and scores it. Deterministic: the same design and scenario
 * always produce the same score, so it can be re-verified server-side for a leaderboard.
 */
export function missingKinds(design: Design, scenario: Scenario): NodeKind[] {
  return scenario.requiredKinds.filter((k) => !design.nodes.some((n) => n.kind === k));
}

export function runScenario(design: Design, scenario: Scenario, seed = 1337): ScenarioResult {
  const missing = missingKinds(design, scenario);
  const sim = new Simulation(design, { seed, samplesPerTick: 120 });
  const dt = 0.1;
  const pending = [...scenario.timeline].sort((a, b) => a.atSec - b.atSec);
  const seconds: ScenarioSecond[] = [];
  const events: SimEvent[] = [];
  const ticks = Math.round(scenario.durationSec / dt);
  // 10s of warm-up so caches, queues and percentiles reach steady state before scoring.
  for (let i = 0; i < 100; i++) sim.step(dt);

  for (let i = 1; i <= ticks; i++) {
    const t = i * dt;
    while (pending.length && pending[0].atSec <= t + 1e-9) {
      const item = pending.shift()!;
      for (const a of resolveScenarioAction(design, item.action)) sim.apply(a);
      events.push({ t: Math.round(t * 10) / 10, level: 'warn', message: item.caption });
    }
    const tick = sim.step(dt);
    events.push(...tick.events.map((e) => ({ ...e, t: Math.round(t * 10) / 10 })));
    if (i % 10 === 0) {
      const m = tick.metrics;
      seconds.push({
        t: Math.round(t),
        metrics: m,
        withinSlo: m.p99Ms <= scenario.goals.maxP99Ms && m.errorRate <= scenario.goals.maxErrorRate,
      });
    }
  }

  const monthlyCostUsd = estimateMonthlyCost(design).totalUsd;
  const overBudget = monthlyCostUsd > scenario.goals.maxMonthlyCostUsd;
  const sloAttainment = seconds.filter((s) => s.withinSlo).length / Math.max(seconds.length, 1);
  const costFactor = overBudget ? scenario.goals.maxMonthlyCostUsd / monthlyCostUsd : 1;
  const eligible = missing.length === 0;
  return {
    scenarioId: scenario.id,
    eligible,
    missingKinds: missing,
    score: eligible ? Math.round(1000 * sloAttainment * costFactor) : 0,
    survived: eligible && sloAttainment >= scenario.minSloAttainment && !overBudget,
    sloAttainment,
    worstP99Ms: Math.max(0, ...seconds.map((s) => s.metrics.p99Ms)),
    avgErrorRate: seconds.reduce((s, x) => s + x.metrics.errorRate, 0) / Math.max(seconds.length, 1),
    monthlyCostUsd,
    overBudget,
    seconds,
    events,
  };
}
