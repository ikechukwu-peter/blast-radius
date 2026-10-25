import { estimateMonthlyCost } from './cost.ts';
import { isSplitKind, resolveConfig } from './defaults.ts';
import { Simulation } from './engine.ts';
import { outgoingMap, reachableFromClients, validateDesign } from './graph.ts';
import type { Design, DesignNode, Metrics } from './types.ts';

/**
 * Deterministic design reviewer. No AI: every finding comes from graph analysis
 * or a short headless simulation run, so the same design always gets the same review.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface Review {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  findings: Finding[];
  /** Steady-state metrics from a 30s run with no chaos (null if the design is invalid). */
  baseline: Metrics | null;
  peakUtilization: Record<string, number>;
  monthlyCostUsd: number;
}

const PENALTY: Record<Severity, number> = { critical: 25, high: 12, medium: 6, low: 2, info: 0 };
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function reviewDesign(design: Design): Review {
  const findings: Finding[] = [];
  const monthlyCostUsd = estimateMonthlyCost(design).totalUsd;

  for (const issue of validateDesign(design)) {
    findings.push({
      ruleId: `VALID_${issue.code.toUpperCase()}`,
      severity: 'critical',
      title: 'Design cannot be simulated',
      detail: issue.message,
      fix: issue.message,
      nodeIds: issue.nodeIds,
      edgeIds: issue.edgeIds,
    });
  }
  if (findings.length) return finalize(findings, null, {}, monthlyCostUsd);

  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const out = outgoingMap(design);
  const reachable = reachableFromClients(design);
  const cfg = (n: DesignNode) => resolveConfig(n);

  // --- Single points of failure ------------------------------------------------
  const canServe = (id: string, removed: string, memo: Map<string, boolean>): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const node = byId.get(id)!;
    const children = out.get(id) ?? [];
    let result: boolean;
    if (id === removed && node.kind !== 'cache') result = false;
    else if (node.kind === 'queue' || !children.length) result = true;
    else if (isSplitKind(node.kind)) result = children.some((e) => canServe(e.target, removed, memo));
    else result = children.filter((e) => (e.weight ?? 1) >= 0.5).every((e) => canServe(e.target, removed, memo));
    memo.set(id, result);
    return result;
  };
  const clients = design.nodes.filter((n) => n.kind === 'client');
  for (const n of design.nodes) {
    if (n.kind === 'client' || n.kind === 'cache' || n.kind === 'external_api' || !reachable.has(n.id)) continue;
    if (cfg(n).replicas >= 2) continue;
    const breaks = clients.some((c) => canServe(c.id, '', new Map()) && !canServe(c.id, n.id, new Map()));
    if (breaks) {
      findings.push({
        ruleId: 'SPOF',
        severity: n.kind === 'database' ? 'critical' : 'high',
        title: `${n.label} is a single point of failure`,
        detail: `${n.label} runs one instance and every request path depends on it. One crash takes the whole system down.`,
        fix:
          n.kind === 'database'
            ? 'Set replicas to 2 or more and enable automatic failover.'
            : 'Run at least 2 replicas, or add a redundant path behind a load balancer.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    }
  }

  // --- Database specifics ------------------------------------------------------
  for (const n of design.nodes) {
    if (n.kind !== 'database') continue;
    const c = cfg(n);
    if (c.replicas >= 2 && (c.failoverSeconds ?? 0) === 0) {
      findings.push({
        ruleId: 'DB_NO_FAILOVER',
        severity: 'medium',
        title: `${n.label} has replicas but no automatic failover`,
        detail: 'Losing the primary means downtime until someone promotes a replica by hand.',
        fix: 'Set failover seconds (for example 30).',
        nodeIds: [n.id],
        edgeIds: [],
      });
    } else if ((c.failoverSeconds ?? 0) > 60) {
      findings.push({
        ruleId: 'DB_SLOW_FAILOVER',
        severity: 'low',
        title: `${n.label} fails over slowly`,
        detail: `Failover takes ${c.failoverSeconds}s; every request in that window fails.`,
        fix: 'Aim for 30s or less.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    }
    const directCallers = design.edges.filter((e) => e.target === n.id && byId.get(e.source)?.kind === 'api_server');
    for (const e of directCallers) {
      const callerHasCache = (out.get(e.source) ?? []).some((x) => byId.get(x.target)?.kind === 'cache');
      if (!callerHasCache) {
        findings.push({
          ruleId: 'NO_CACHE',
          severity: 'medium',
          title: `Every read from ${byId.get(e.source)!.label} hits ${n.label}`,
          detail: 'There is no cache in front of the database, so database load grows 1:1 with traffic.',
          fix: 'Put a cache between the API and the database (API -> Cache -> Database).',
          nodeIds: [e.source, n.id],
          edgeIds: [e.id],
        });
      }
    }
  }

  // --- Resilience patterns -----------------------------------------------------
  const anyBreaker = design.nodes.some((n) => cfg(n).circuitBreaker);
  for (const c of clients) {
    if ((cfg(c).retries ?? 0) > 0 && !anyBreaker) {
      findings.push({
        ruleId: 'RETRY_STORM',
        severity: 'medium',
        title: 'Retries without a circuit breaker',
        detail: `${c.label} retries failures ${cfg(c).retries}x. When something degrades, retries multiply load on it and stop it from recovering.`,
        fix: 'Enable a circuit breaker on API servers, or reduce retries.',
        nodeIds: [c.id],
        edgeIds: [],
      });
    }
    if ((cfg(c).timeoutMs ?? 0) > 10_000) {
      findings.push({
        ruleId: 'LONG_TIMEOUT',
        severity: 'low',
        title: `${c.label} waits ${cfg(c).timeoutMs}ms before giving up`,
        detail: 'Long timeouts hold connections open during incidents and hide failures.',
        fix: 'Use a timeout close to your latency SLO (for example 2000ms).',
        nodeIds: [c.id],
        edgeIds: [],
      });
    }
  }
  for (const e of design.edges) {
    const src = byId.get(e.source);
    const dst = byId.get(e.target);
    if (!src || !dst) continue;
    if (dst.kind === 'external_api' && src.kind === 'api_server' && !cfg(src).circuitBreaker) {
      findings.push({
        ruleId: 'SYNC_THIRD_PARTY',
        severity: 'medium',
        title: `${src.label} calls ${dst.label} synchronously`,
        detail: 'A slow or failing third party will stall your request path. You do not control its uptime.',
        fix: 'Move the call behind a queue + worker, or enable a circuit breaker on the API server.',
        nodeIds: [src.id, dst.id],
        edgeIds: [e.id],
      });
    }
  }
  for (const n of design.nodes) {
    if (n.kind === 'queue' && !(out.get(n.id) ?? []).length) {
      findings.push({
        ruleId: 'QUEUE_NO_CONSUMER',
        severity: 'high',
        title: `${n.label} has no consumers`,
        detail: 'Messages are accepted but never processed. The queue will fill up and start dropping.',
        fix: 'Connect the queue to a Worker.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    }
    if ((n.kind === 'api_server' || n.kind === 'worker') && !cfg(n).autoscale?.enabled) {
      findings.push({
        ruleId: 'NO_AUTOSCALE',
        severity: 'low',
        title: `${n.label} has a fixed replica count`,
        detail: 'Traffic spikes beyond current capacity will be dropped instead of absorbed.',
        fix: 'Enable autoscaling with a sensible max.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    }
    if (n.kind !== 'client' && !reachable.has(n.id)) {
      findings.push({
        ruleId: 'ORPHAN',
        severity: 'info',
        title: `${n.label} receives no traffic`,
        detail: 'No path from any client reaches this node.',
        fix: 'Connect it, or remove it to save cost.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    }
  }

  // --- Capacity (headless run) -------------------------------------------------
  const sim = new Simulation(design, { seed: 7, samplesPerTick: 100 });
  const peak: Record<string, number> = {};
  let baseline: Metrics | null = null;
  for (let i = 0; i < 300; i++) {
    const tick = sim.step(0.1);
    for (const [id, r] of Object.entries(tick.nodes)) peak[id] = Math.max(peak[id] ?? 0, r.utilization);
    baseline = tick.metrics;
  }
  for (const n of design.nodes) {
    if (n.kind === 'client' || !reachable.has(n.id)) continue;
    const u = peak[n.id] ?? 0;
    const pct = Math.round(u * 100);
    if (u > 1) {
      findings.push({
        ruleId: 'OVERLOADED',
        severity: 'critical',
        title: `${n.label} is overloaded at normal traffic (${pct}%)`,
        detail: 'It is dropping requests before any chaos is injected.',
        fix: 'Add replicas, raise capacity, or put a cache in front of it.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    } else if (u > 0.8) {
      findings.push({
        ruleId: 'RUNNING_HOT',
        severity: 'high',
        title: `${n.label} runs hot (${pct}% at peak)`,
        detail: 'Latency climbs steeply above ~80% utilization, and there is no headroom for a spike.',
        fix: 'Add headroom: more replicas or autoscaling.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    } else if (u < 0.15 && resolveConfig(n).replicas > 2) {
      findings.push({
        ruleId: 'OVERPROVISIONED',
        severity: 'info',
        title: `${n.label} is mostly idle (${pct}% at peak)`,
        detail: 'You are paying for capacity you do not use.',
        fix: 'Reduce replicas and rely on autoscaling.',
        nodeIds: [n.id],
        edgeIds: [],
      });
    }
  }

  return finalize(findings, baseline, peak, monthlyCostUsd);
}

function finalize(findings: Finding[], baseline: Metrics | null, peak: Record<string, number>, monthlyCostUsd: number): Review {
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + PENALTY[f.severity], 0));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
  return { score, grade, findings, baseline, peakUtilization: peak, monthlyCostUsd };
}
