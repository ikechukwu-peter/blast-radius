import { KIND_LABELS, estimateMonthlyCost, isSplitKind, resolveConfig } from '@/core';
import type { Design, Metrics, Review, Scenario, ScenarioResult, SimEvent, TickResult } from '@/core';

/**
 * Turns deterministic engine output into a compact fact sheet for the language model.
 *
 * Small on-device models have a 4k-token window and hallucinate numbers they aren't given,
 * so this is the only thing the model knows: every figure it can quote comes from here.
 * Pure function: no DOM, no store, unit-tested.
 */

export interface AnalysisInput {
  design: Design;
  review?: Review | null;
  /** Latest live tick (editor) — current per-node state. */
  tick?: TickResult | null;
  /** Per-second history, newest last. */
  history?: { t: number; p99: number; errorPct: number; rps: number }[];
  events?: SimEvent[];
  /** Chaos currently applied in the editor, e.g. "Traffic 10x", "Postgres: DOWN". */
  activeChaos?: string[];
  scenario?: Scenario | null;
  result?: ScenarioResult | null;
}

const MAX_CHARS = 5000;

const ms = (n: number) => (Number.isFinite(n) ? `${Math.round(n)}ms` : 'unbounded');
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function metricsLine(m: Metrics) {
  return `throughput ${Math.round(m.throughputRps)} rps of ${Math.round(m.offeredRps)} offered, errors ${pct(m.errorRate)}, p50 ${ms(m.p50Ms)}, p95 ${ms(m.p95Ms)}, p99 ${ms(m.p99Ms)}`;
}

/** Contiguous [start, end] second ranges where `bad(i)` holds. */
export function ranges<T>(items: T[], at: (x: T) => number, bad: (x: T) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  let prev = 0;
  for (const x of items) {
    const t = at(x);
    if (bad(x) && start === null) start = t;
    if (!bad(x) && start !== null) {
      out.push([start, prev]);
      start = null;
    }
    prev = t;
  }
  if (start !== null) out.push([start, prev]);
  return out;
}

/**
 * The simulator's own diagnosis, in one or two sentences with numbers. Small models are
 * poor at finding the key figure in a page of facts, so the engine finds it for them.
 */
export function headline(input: AnalysisInput): string[] {
  const { design, tick, activeChaos, scenario, result } = input;
  const label = new Map(design.nodes.map((n) => [n.id, n.label]));
  const kindOf = new Map(design.nodes.map((n) => [n.id, n.kind]));
  const out: string[] = [];

  if (scenario && result) {
    const g = scenario.goals;
    if (!result.eligible) out.push(`The design cannot enter: it needs ${result.missingKinds.join(', ')}.`);
    else if (result.overBudget) out.push(`It costs $${result.monthlyCostUsd}/mo against a $${g.maxMonthlyCostUsd} budget, so it fails on cost.`);
    else
      out.push(
        `${result.survived ? 'Survived' : 'Failed'} ${scenario.title}: ${pct(result.sloAttainment)} of seconds within SLO (needs ${pct(scenario.minSloAttainment)}); worst p99 ${ms(result.worstP99Ms)} vs a ${g.maxP99Ms}ms goal; average errors ${pct(result.avgErrorRate)} vs ${pct(g.maxErrorRate)}.`,
      );
  }

  if (tick) {
    const nodes = Object.values(tick.nodes).filter((r) => kindOf.get(r.id) !== 'client');
    const down = nodes.filter((r) => r.status === 'down' || r.status === 'failing_over');
    const overloaded = nodes.filter((r) => r.utilization > 1).sort((a, b) => b.utilization - a.utilization);
    for (const r of down) out.push(`${label.get(r.id)} is ${r.status === 'down' ? 'DOWN' : 'failing over'}.`);
    if (overloaded[0]) {
      const r = overloaded[0];
      out.push(
        `Main bottleneck: ${label.get(r.id)} is OVERLOADED at ${Math.round(r.utilization * 100)}% of capacity (${r.activeReplicas} replica${r.activeReplicas === 1 ? '' : 's'}), dropping ${Math.round(r.droppedRps)} rps.`,
      );
    }
    const m = tick.metrics;
    out.push(`Users see ${pct(m.errorRate)} errors and p99 ${ms(m.p99Ms)}.`);
    if (activeChaos?.length) out.push(`Caused by: ${activeChaos.join('; ')}.`);
  }
  return out;
}

export function buildAnalysisContext(input: AnalysisInput): string {
  const { design, review, tick, history, events, activeChaos, scenario, result } = input;
  const label = new Map(design.nodes.map((n) => [n.id, n.label]));
  const lines: string[] = [];

  const head = headline(input);
  if (head.length) {
    lines.push('## Headline (computed by the simulator; quote these numbers)');
    lines.push(...head);
  }

  lines.push('## Components');
  for (const n of design.nodes) {
    const c = resolveConfig(n);
    const typeName = n.appearance?.typeLabel ? `${n.appearance.typeLabel}, behaves like ${KIND_LABELS[n.kind]}` : KIND_LABELS[n.kind];
    const parts = [`${n.label} (${typeName})`];
    if (n.kind === 'client') {
      parts.push(`${c.rps} rps ${c.trafficPattern}`, `retries ${c.retries}`, `timeout ${c.timeoutMs}ms`);
    } else {
      if (n.kind !== 'external_api') parts.push(`replicas ${c.replicas}`);
      parts.push(`capacity ${c.capacityPerReplica} rps/replica`, `base latency ${c.baseLatencyMs}ms`);
      if (c.hitRate !== undefined) parts.push(`hit rate ${pct(c.hitRate)}`);
      if (n.kind === 'database') parts.push(`failover ${c.failoverSeconds ? `${c.failoverSeconds}s` : 'none'}`);
      if (c.autoscale?.enabled) parts.push(`autoscale ${c.autoscale.min}-${c.autoscale.max} at ${pct(c.autoscale.targetUtilization)}`);
      if (c.circuitBreaker) parts.push('circuit breaker on');
      if (n.kind === 'queue') parts.push(`max depth ${c.maxQueueDepth}`);
    }
    lines.push(`- ${parts.join(', ')}`);
  }

  lines.push('## Connections');
  const kindOf = new Map(design.nodes.map((n) => [n.id, n.kind]));
  for (const e of design.edges.filter((x) => (x.kind ?? 'traffic') === 'traffic')) {
    const split = isSplitKind(kindOf.get(e.source) ?? 'api_server');
    const w = e.weight ?? 1;
    const how = split ? (w !== 1 ? `split weight ${w}` : 'split') : w < 1 ? `${Math.round(w * 100)}% of requests` : 'every request';
    lines.push(`- ${label.get(e.source)} -> ${label.get(e.target)} (${how})${e.label ? ` "${e.label}"` : ''}`);
  }
  lines.push(`Monthly cost: $${estimateMonthlyCost(design).totalUsd}`);

  if (review) {
    lines.push(`## Design review: grade ${review.grade} (${review.score}/100)`);
    if (review.baseline) lines.push(`Baseline at normal traffic: ${metricsLine(review.baseline)}`);
    for (const f of review.findings.slice(0, 8)) lines.push(`- [${f.severity}] ${f.title}. Fix: ${f.fix}`);
    if (!review.findings.length) lines.push('- No findings.');
  }

  if (tick) {
    lines.push(`## Live simulation at t=${Math.round(tick.t)}s`);
    lines.push(`Now: ${metricsLine(tick.metrics)}`);
    if (activeChaos?.length) lines.push(`Active chaos: ${activeChaos.join('; ')}.`);
    for (const n of design.nodes.filter((x) => x.kind === 'client')) {
      const sent = tick.nodes[n.id]?.inRps ?? 0;
      const configured = resolveConfig(n).rps ?? 0;
      lines.push(`- ${n.label} sending ${Math.round(sent)} rps (configured ${configured} rps${configured > 0 ? `, ${(sent / configured).toFixed(1)}x` : ''})`);
    }
    const hot = Object.values(tick.nodes)
      .filter((r) => kindOf.get(r.id) !== 'client' && (r.status !== 'healthy' || r.utilization > 0.7 || r.droppedRps > 1))
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 6);
    for (const r of hot) {
      const bits = [`${label.get(r.id)}: ${r.status}`, `utilization ${Math.round(r.utilization * 100)}%`, `${r.activeReplicas} replicas`, `latency ${ms(r.latencyMs)}`];
      if (r.droppedRps > 1) bits.push(`dropping ${Math.round(r.droppedRps)} rps`);
      if (r.warmingUntil.length) bits.push(`${r.warmingUntil.length} replicas warming up`);
      if (kindOf.get(r.id) === 'queue') bits.push(`queue depth ${Math.round(r.queueDepth)}`);
      lines.push(`- ${bits.join(', ')}`);
    }
    const blocked = Object.values(tick.edges).filter((e) => e.partitioned || e.breakerOpen || e.extraLatencyMs > 0);
    for (const er of blocked) {
      const e = design.edges.find((x) => x.id === er.id);
      if (!e) continue;
      const what = er.partitioned ? 'partitioned' : er.breakerOpen ? 'circuit breaker open' : `+${er.extraLatencyMs}ms injected latency`;
      lines.push(`- ${label.get(e.source)} -> ${label.get(e.target)}: ${what}`);
    }
  }

  if (history?.length) {
    const worst = history.reduce((a, b) => (b.p99 > a.p99 ? b : a));
    const errSpans = ranges(history, (h) => h.t, (h) => h.errorPct > 1);
    lines.push(`## Last ${history.length}s of telemetry`);
    lines.push(`Worst p99 ${ms(worst.p99)} at t=${worst.t}s. Peak error rate ${Math.max(...history.map((h) => h.errorPct)).toFixed(1)}%.`);
    if (errSpans.length) lines.push(`Errors above 1% during: ${errSpans.map(([a, b]) => `${a}-${b}s`).join(', ')}.`);
  }

  if (events?.length) {
    lines.push('## Incident log (oldest first)');
    for (const e of [...events].reverse().slice(-15)) lines.push(`- t=${Math.round(e.t)}s ${e.message}`);
  }

  if (scenario && result) {
    lines.push(`## Challenge: ${scenario.title}`);
    lines.push(scenario.briefing);
    lines.push(
      `Goals: p99 <= ${scenario.goals.maxP99Ms}ms, errors <= ${pct(scenario.goals.maxErrorRate)}, cost <= $${scenario.goals.maxMonthlyCostUsd}/mo, survive = ${pct(scenario.minSloAttainment)} of seconds within SLO.`,
    );
    lines.push(`Timeline: ${scenario.timeline.map((t) => `${t.atSec}s ${t.caption}`).join('; ')}.`);
    lines.push(
      `Result: score ${result.score}/1000, ${result.survived ? 'SURVIVED' : 'FAILED'}, ${pct(result.sloAttainment)} of seconds within SLO, worst p99 ${ms(result.worstP99Ms)}, average errors ${pct(result.avgErrorRate)}, cost $${result.monthlyCostUsd}${result.overBudget ? ' (OVER BUDGET)' : ''}.`,
    );
    const failing = ranges(result.seconds, (s) => s.t, (s) => !s.withinSlo);
    if (failing.length) lines.push(`Outside SLO during: ${failing.map(([a, b]) => `${a}-${b}s`).join(', ')}.`);
    const notable = result.events.filter((e) => e.level !== 'info' || /scaled|failover|breaker/i.test(e.message)).slice(0, 15);
    for (const e of notable) lines.push(`- t=${Math.round(e.t)}s ${e.message}`);
  }

  const text = lines.join('\n');
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…(truncated)` : text;
}

export const SYSTEM_PROMPT = `You are a senior site reliability engineer reviewing a system design in Blast Radius, a deterministic traffic simulator.

Rules:
- Use ONLY the facts below. Quote numbers exactly as given. If something is not in the facts, say you can't see it.
- Name components by their labels.
- Recommend concrete changes the user can make in the editor: replicas, capacity per replica, autoscaling (min, max, target utilization, warm-up), circuit breaker, cache hit rate, a cache in front of the database, a queue + worker in front of slow third parties, database failover seconds, client retries and timeout.
- Prefer the cheapest fix that works; the challenges have a budget.
- Structure: start from the Headline. First sentence restates the main cause with its numbers. Then 1-3 concrete fixes, most effective and cheapest first, each naming the component and the setting to change.
- Be brief: under 150 words. No preamble, no closing summary.

Engine semantics you can rely on: load balancers and clients split traffic; every other component calls all of its dependencies; latency rises steeply above ~80% utilization; a dead cache passes every request to the database; client retries multiply load when errors rise; autoscaling adds replicas after 10s above target and they take warm-up seconds to start serving.`;
