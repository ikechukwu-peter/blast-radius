import { isSplitKind, resolveConfig } from './defaults.ts';
import { outgoingMap, simulatedDesign, topologicalOrder } from './graph.ts';
import type {
  ChaosAction,
  Design,
  DesignEdge,
  DesignNode,
  EdgeRuntime,
  Metrics,
  NodeConfig,
  NodeRuntime,
  SimEvent,
  TickResult,
  TrafficPattern,
} from './types.ts';

/**
 * Blast Radius simulation engine.
 *
 * Two layers run every tick:
 * 1. Fluid model: request rates (rps) flow through the graph in topological order.
 *    Each node serves up to its capacity and drops the rest. This drives utilization,
 *    queue depth, autoscaling, circuit breakers and the particle density in the UI.
 * 2. Sampling: a few hundred synthetic requests walk the graph using the per-node
 *    failure probability and latency from layer 1. This gives real p50/p95/p99 and
 *    end-to-end error rate, including timeouts.
 *
 * Deterministic for a given seed, so a design + scenario always produces the same score.
 */

interface ResolvedNode extends DesignNode {
  config: NodeConfig;
}

export interface SimulationOptions {
  seed?: number;
  /** Synthetic requests sampled per tick (shared across clients). */
  samplesPerTick?: number;
}

const BREAKER_OPEN_SECONDS = 10;
const BREAKER_TRIP_FAILURE = 0.5;
const SCALE_OUT_AFTER_SECONDS = 10;
const SCALE_IN_AFTER_SECONDS = 30;
const METRICS_WINDOW_SECONDS = 1;
const MAX_DEPTH = 32;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function trafficPatternMultiplier(pattern: TrafficPattern | undefined, t: number): number {
  switch (pattern) {
    case 'diurnal':
      // One simulated "day" every 60s, peak 1.5x, trough 0.5x.
      return 1 + 0.5 * Math.sin((2 * Math.PI * t) / 60);
    case 'spiky':
      // 3x burst for 3s every 20s.
      return t % 20 < 3 ? 3 : 1;
    default:
      return 1;
  }
}

/** Retries multiply load: 1 + e + e^2 + ... + e^retries. */
export function retryAmplification(errorRate: number, retries: number): number {
  const e = Math.min(Math.max(errorRate, 0), 0.99);
  let amp = 0;
  for (let k = 0; k <= retries; k++) amp += e ** k;
  return amp;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

export class Simulation {
  private readonly nodes = new Map<string, ResolvedNode>();
  private readonly out: Map<string, DesignEdge[]>;
  private readonly order: string[];
  private readonly rt = new Map<string, NodeRuntime>();
  private readonly ert = new Map<string, EdgeRuntime>();
  private readonly breakerUntil = new Map<string, number>();
  private readonly downUntil = new Map<string, number>();
  private readonly highUtilSince = new Map<string, number | null>();
  private readonly lowUtilSince = new Map<string, number | null>();
  private readonly clientError = new Map<string, number>();
  private readonly rand: () => number;
  private readonly samplesPerTick: number;
  private window: { t: number; latencies: number[]; failed: number; total: number; offered: number }[] = [];
  private events: SimEvent[] = [];
  private trafficMultiplier = 1;
  private t = 0;

  constructor(input: Design, options: SimulationOptions = {}) {
    const design = simulatedDesign(input);
    const order = topologicalOrder(design);
    if (!order) throw new Error('Design has a cycle. Run validateDesign() first.');
    this.order = order;
    this.out = outgoingMap(design);
    this.rand = mulberry32(options.seed ?? 42);
    this.samplesPerTick = options.samplesPerTick ?? 200;

    for (const n of design.nodes) {
      const config = resolveConfig(n);
      this.nodes.set(n.id, { ...n, config });
      this.rt.set(n.id, {
        id: n.id,
        status: 'healthy',
        activeReplicas: Math.max(1, config.replicas),
        warmingUntil: [],
        inRps: 0,
        servedRps: 0,
        droppedRps: 0,
        erroredRps: 0,
        utilization: 0,
        latencyMs: config.baseLatencyMs,
        queueDepth: 0,
        queueLagSec: 0,
      });
      this.highUtilSince.set(n.id, null);
      this.lowUtilSince.set(n.id, null);
    }
    for (const e of design.edges) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) continue;
      this.ert.set(e.id, { id: e.id, rps: 0, failingRps: 0, extraLatencyMs: 0, partitioned: false, breakerOpen: false });
    }
  }

  get time(): number {
    return this.t;
  }

  // ---------------------------------------------------------------- chaos

  apply(action: ChaosAction): void {
    switch (action.type) {
      case 'kill_instance':
        return this.killInstance(action.nodeId);
      case 'outage': {
        const rt = this.rt.get(action.nodeId);
        if (!rt) return;
        rt.status = 'down';
        this.emit('critical', `${this.label(action.nodeId)} is completely down`, { nodeId: action.nodeId });
        return;
      }
      case 'degrade': {
        const rt = this.rt.get(action.nodeId);
        if (!rt || rt.status === 'down') return;
        rt.status = 'degraded';
        this.emit('warn', `${this.label(action.nodeId)} is degraded (30% capacity, 3x latency)`, { nodeId: action.nodeId });
        return;
      }
      case 'recover':
        return this.recover(action.nodeId);
      case 'add_latency': {
        const er = this.ert.get(action.edgeId);
        if (!er) return;
        er.extraLatencyMs += action.ms;
        this.emit('warn', `+${action.ms}ms latency on ${this.edgeLabel(action.edgeId)}`, { edgeId: action.edgeId });
        return;
      }
      case 'partition': {
        const er = this.ert.get(action.edgeId);
        if (!er) return;
        er.partitioned = true;
        this.emit('critical', `Network partition: ${this.edgeLabel(action.edgeId)}`, { edgeId: action.edgeId });
        return;
      }
      case 'heal': {
        const er = this.ert.get(action.edgeId);
        if (!er) return;
        er.partitioned = false;
        er.extraLatencyMs = 0;
        this.emit('info', `Network healed: ${this.edgeLabel(action.edgeId)}`, { edgeId: action.edgeId });
        return;
      }
      case 'traffic':
        this.trafficMultiplier = Math.max(0, action.multiplier);
        this.emit(action.multiplier > 1 ? 'warn' : 'info', `Traffic set to ${action.multiplier}x`);
        return;
      case 'recover_all':
        for (const id of this.nodes.keys()) this.recover(id, true);
        for (const er of this.ert.values()) {
          er.partitioned = false;
          er.extraLatencyMs = 0;
        }
        this.trafficMultiplier = 1;
        this.emit('info', 'All chaos cleared');
        return;
    }
  }

  private killInstance(id: string): void {
    const rt = this.rt.get(id);
    const node = this.nodes.get(id);
    if (!rt || !node || rt.status === 'down') return;
    if (node.kind === 'database') {
      const failover = node.config.failoverSeconds ?? 0;
      if (rt.activeReplicas > 1 && failover > 0) {
        rt.activeReplicas -= 1;
        rt.status = 'failing_over';
        this.downUntil.set(id, this.t + failover);
        this.emit('critical', `${node.label} primary lost, failing over (${failover}s)`, { nodeId: id });
      } else {
        rt.activeReplicas = Math.max(0, rt.activeReplicas - 1);
        rt.status = 'down';
        this.emit('critical', `${node.label} primary lost with no automatic failover`, { nodeId: id });
      }
      return;
    }
    if (rt.activeReplicas > 1) {
      rt.activeReplicas -= 1;
      this.emit('warn', `${node.label} lost an instance (${rt.activeReplicas} left)`, { nodeId: id });
    } else {
      rt.activeReplicas = 0;
      rt.status = 'down';
      this.emit('critical', `${node.label} lost its only instance and is down`, { nodeId: id });
    }
  }

  private recover(id: string, silent = false): void {
    const rt = this.rt.get(id);
    const node = this.nodes.get(id);
    if (!rt || !node) return;
    const wasUnhealthy = rt.status !== 'healthy' || rt.activeReplicas < node.config.replicas;
    rt.status = 'healthy';
    rt.activeReplicas = Math.max(rt.activeReplicas, node.config.replicas, 1);
    this.downUntil.delete(id);
    if (wasUnhealthy && !silent) this.emit('info', `${node.label} recovered`, { nodeId: id });
  }

  // ---------------------------------------------------------------- tick

  step(dt = 0.1): TickResult {
    this.t += dt;
    this.advanceLifecycle();
    this.computeFlow(dt);
    this.updateBreakers();
    this.autoscale();
    const metrics = this.sample();
    const events = this.events;
    this.events = [];
    return {
      t: this.t,
      nodes: Object.fromEntries([...this.rt].map(([id, r]) => [id, { ...r, warmingUntil: [...r.warmingUntil] }])),
      edges: Object.fromEntries([...this.ert].map(([id, e]) => [id, { ...e }])),
      metrics,
      events,
    };
  }

  private advanceLifecycle(): void {
    for (const [id, rt] of this.rt) {
      const ready = rt.warmingUntil.filter((at) => at <= this.t).length;
      if (ready) {
        rt.warmingUntil = rt.warmingUntil.filter((at) => at > this.t);
        rt.activeReplicas += ready;
        this.emit('info', `${this.label(id)} scaled out to ${rt.activeReplicas} replicas`, { nodeId: id });
      }
      const until = this.downUntil.get(id);
      if (rt.status === 'failing_over' && until !== undefined && this.t >= until) {
        rt.status = 'healthy';
        this.downUntil.delete(id);
        this.emit('info', `${this.label(id)} failover complete`, { nodeId: id });
      }
    }
  }

  private capacity(id: string): number {
    const rt = this.rt.get(id)!;
    const cfg = this.nodes.get(id)!.config;
    if (rt.status === 'down' || rt.status === 'failing_over') return 0;
    const cap = cfg.capacityPerReplica * rt.activeReplicas;
    return rt.status === 'degraded' ? cap * 0.3 : cap;
  }

  private isUnavailable(id: string): boolean {
    const s = this.rt.get(id)!.status;
    return s === 'down' || s === 'failing_over';
  }

  private edgeBlocked(e: DesignEdge): boolean {
    const er = this.ert.get(e.id)!;
    return er.partitioned || er.breakerOpen;
  }

  /** Edges a split node may pick. Load balancers health-check; clients do not. */
  private splitCandidates(node: ResolvedNode, edges: DesignEdge[]): DesignEdge[] {
    if (node.kind === 'client') return edges;
    return edges.filter((e) => !this.edgeBlocked(e) && !this.isUnavailable(e.target));
  }

  private computeFlow(dt: number): void {
    const inflow = new Map<string, number>();
    for (const er of this.ert.values()) {
      er.rps = 0;
      er.failingRps = 0;
    }

    for (const id of this.order) {
      const node = this.nodes.get(id)!;
      const cfg = node.config;
      const rt = this.rt.get(id)!;
      let incoming = inflow.get(id) ?? 0;

      if (node.kind === 'client') {
        const base = (cfg.rps ?? 0) * trafficPatternMultiplier(cfg.trafficPattern, this.t) * this.trafficMultiplier;
        incoming = base * retryAmplification(this.clientError.get(id) ?? 0, cfg.retries ?? 0);
      }

      const cap = this.capacity(id);
      let served: number;
      let dropped: number;
      let forward: number;

      if (node.kind === 'client') {
        served = incoming;
        dropped = 0;
        forward = incoming;
      } else if (node.kind === 'cache' && rt.status === 'down') {
        // A dead cache is bypassed: every request falls through to the database (thundering herd).
        served = incoming;
        dropped = 0;
        forward = incoming;
      } else if (node.kind === 'queue') {
        const accepted = Math.min(incoming, cap);
        dropped = incoming - accepted;
        rt.queueDepth += accepted * dt;
        const drainCapacity = (this.out.get(id) ?? [])
          .filter((e) => !this.edgeBlocked(e))
          .reduce((sum, e) => sum + this.capacity(e.target), 0);
        const drain = Math.min(rt.queueDepth / dt, drainCapacity);
        rt.queueDepth -= drain * dt;
        const max = cfg.maxQueueDepth ?? Infinity;
        let overflowRate = 0;
        if (rt.queueDepth > max) {
          overflowRate = (rt.queueDepth - max) / dt;
          rt.queueDepth = max;
        }
        dropped += Math.min(overflowRate, accepted);
        served = incoming - dropped;
        forward = drain;
        rt.queueLagSec = drain > 0 ? rt.queueDepth / drain : rt.queueDepth > 0 ? Infinity : 0;
      } else {
        served = Math.min(incoming, cap);
        dropped = incoming - served;
        forward = 0; // set below
      }

      const errored = node.kind === 'client' ? 0 : served * cfg.errorRate;
      if (node.kind !== 'client' && node.kind !== 'queue' && !(node.kind === 'cache' && rt.status === 'down')) {
        const ok = served - errored;
        forward = node.kind === 'cache' || node.kind === 'cdn' ? ok * (1 - (cfg.hitRate ?? 0)) : ok;
      }

      // Latency: M/M/1-style curve, capped at 20x base when saturated.
      const util = cap > 0 ? incoming / cap : incoming > 0 ? 1 : 0;
      rt.utilization = node.kind === 'client' ? 0 : Math.min(util, 10);
      if (node.kind === 'client' || (node.kind === 'cache' && rt.status === 'down') || this.isUnavailable(id)) {
        rt.latencyMs = 0;
      } else if (node.kind === 'queue') {
        rt.latencyMs = cfg.baseLatencyMs;
      } else {
        const curve = 1 / (1 - Math.min(util, 0.95));
        rt.latencyMs = cfg.baseLatencyMs * curve * (rt.status === 'degraded' ? 3 : 1);
      }

      // Distribute downstream.
      const edges = this.out.get(id) ?? [];
      if (edges.length && forward > 0) {
        if (isSplitKind(node.kind)) {
          const candidates = this.splitCandidates(node, edges);
          const totalWeight = candidates.reduce((s, e) => s + Math.max(0, e.weight ?? 1), 0);
          if (!candidates.length || totalWeight <= 0) {
            dropped += forward; // load balancer with no healthy backend -> 503
          } else {
            for (const e of candidates) {
              const share = (forward * Math.max(0, e.weight ?? 1)) / totalWeight;
              this.deliver(e, share, inflow);
            }
          }
        } else {
          for (const e of edges) {
            const share = forward * Math.min(1, Math.max(0, e.weight ?? 1));
            this.deliver(e, share, inflow);
          }
        }
      }

      rt.inRps = incoming;
      rt.servedRps = served;
      rt.droppedRps = dropped;
      rt.erroredRps = errored;
    }
  }

  private deliver(e: DesignEdge, rps: number, inflow: Map<string, number>): void {
    const er = this.ert.get(e.id)!;
    if (this.edgeBlocked(e)) {
      er.failingRps += rps;
      return;
    }
    er.rps += rps;
    inflow.set(e.target, (inflow.get(e.target) ?? 0) + rps);
  }

  /** Probability that a request reaching this node fails here. */
  private failProbability(id: string): number {
    const node = this.nodes.get(id)!;
    const rt = this.rt.get(id)!;
    if (node.kind === 'client') return 0;
    if (node.kind === 'cache' && rt.status === 'down') return 0;
    if (this.isUnavailable(id)) return 1;
    if (rt.inRps <= 0) return node.config.errorRate;
    return Math.min(1, (rt.droppedRps + rt.erroredRps) / rt.inRps);
  }

  private updateBreakers(): void {
    for (const [srcId, edges] of this.out) {
      const src = this.nodes.get(srcId)!;
      if (!src.config.circuitBreaker) continue;
      for (const e of edges) {
        const er = this.ert.get(e.id);
        if (!er) continue;
        const until = this.breakerUntil.get(e.id);
        if (er.breakerOpen && until !== undefined && this.t >= until) {
          er.breakerOpen = false; // half-open: let traffic through and re-evaluate
          this.breakerUntil.delete(e.id);
          this.emit('info', `Circuit breaker closed: ${this.edgeLabel(e.id)}`, { edgeId: e.id });
          continue;
        }
        if (er.breakerOpen) continue;
        const targetFail = this.failProbability(e.target);
        const timingOut = this.rt.get(e.target)!.latencyMs + er.extraLatencyMs > (this.clientTimeout() ?? Infinity);
        if ((er.rps > 0 || this.isUnavailable(e.target)) && (targetFail > BREAKER_TRIP_FAILURE || timingOut)) {
          er.breakerOpen = true;
          this.breakerUntil.set(e.id, this.t + BREAKER_OPEN_SECONDS);
          this.emit('warn', `Circuit breaker opened: ${this.edgeLabel(e.id)} (failing fast)`, { edgeId: e.id });
        }
      }
    }
  }

  private clientTimeout(): number | undefined {
    let min: number | undefined;
    for (const n of this.nodes.values()) {
      if (n.kind === 'client') min = Math.min(min ?? Infinity, n.config.timeoutMs ?? Infinity);
    }
    return min;
  }

  private autoscale(): void {
    for (const [id, node] of this.nodes) {
      const as = node.config.autoscale;
      if (!as?.enabled) continue;
      const rt = this.rt.get(id)!;
      if (rt.status === 'down') continue;
      const total = rt.activeReplicas + rt.warmingUntil.length;
      // Utilization against active capacity, ignoring degradation, the way a real metric would see it.
      if (rt.utilization > as.targetUtilization) {
        this.lowUtilSince.set(id, null);
        const since = this.highUtilSince.get(id) ?? this.t;
        this.highUtilSince.set(id, since);
        if (this.t - since >= SCALE_OUT_AFTER_SECONDS && total < as.max) {
          // Target-tracking: add enough replicas to bring utilization back to target.
          const desired = Math.ceil((rt.activeReplicas * rt.utilization) / as.targetUtilization);
          const add = Math.max(1, Math.min(as.max, desired) - total);
          for (let i = 0; i < add; i++) rt.warmingUntil.push(this.t + as.warmupSeconds);
          this.highUtilSince.set(id, this.t);
          this.emit('info', `${node.label} autoscaling: +${add} replicas warming up (${as.warmupSeconds}s)`, { nodeId: id });
        }
      } else if (rt.utilization < as.targetUtilization * 0.4) {
        this.highUtilSince.set(id, null);
        const since = this.lowUtilSince.get(id) ?? this.t;
        this.lowUtilSince.set(id, since);
        if (this.t - since >= SCALE_IN_AFTER_SECONDS && rt.activeReplicas > as.min) {
          rt.activeReplicas -= 1;
          this.lowUtilSince.set(id, this.t);
          this.emit('info', `${node.label} scaled in to ${rt.activeReplicas} replicas`, { nodeId: id });
        }
      } else {
        this.highUtilSince.set(id, null);
        this.lowUtilSince.set(id, null);
      }
    }
  }

  // ---------------------------------------------------------------- sampling

  private expSample(mean: number): number {
    if (mean <= 0) return 0;
    return -Math.log(1 - this.rand()) * mean;
  }

  private walk(id: string, depth: number): { ok: boolean; latency: number } {
    if (depth > MAX_DEPTH) return { ok: true, latency: 0 };
    const node = this.nodes.get(id)!;
    const rt = this.rt.get(id)!;
    let latency = 0;

    const bypassedCache = node.kind === 'cache' && rt.status === 'down';
    if (node.kind !== 'client' && !bypassedCache) {
      if (this.rand() < this.failProbability(id)) return { ok: false, latency };
      latency += this.expSample(rt.latencyMs);
      if ((node.kind === 'cache' || node.kind === 'cdn') && this.rand() < (node.config.hitRate ?? 0)) {
        return { ok: true, latency };
      }
      if (node.kind === 'queue') return { ok: true, latency }; // async: caller is done once enqueued
    }

    const edges = this.out.get(id) ?? [];
    if (!edges.length) return { ok: true, latency };

    if (isSplitKind(node.kind)) {
      const candidates = this.splitCandidates(node, edges);
      const total = candidates.reduce((s, e) => s + Math.max(0, e.weight ?? 1), 0);
      if (!candidates.length || total <= 0) return { ok: false, latency };
      let r = this.rand() * total;
      let chosen = candidates[candidates.length - 1];
      for (const e of candidates) {
        r -= Math.max(0, e.weight ?? 1);
        if (r <= 0) {
          chosen = e;
          break;
        }
      }
      if (this.edgeBlocked(chosen)) return { ok: false, latency };
      const child = this.walk(chosen.target, depth + 1);
      return { ok: child.ok, latency: latency + this.hopLatency(chosen) + child.latency };
    }

    for (const e of edges) {
      const p = Math.min(1, Math.max(0, e.weight ?? 1));
      if (p < 1 && this.rand() >= p) continue;
      if (this.edgeBlocked(e)) return { ok: false, latency };
      const child = this.walk(e.target, depth + 1);
      latency += this.hopLatency(e) + child.latency;
      if (!child.ok) return { ok: false, latency };
    }
    return { ok: true, latency };
  }

  private hopLatency(e: DesignEdge): number {
    return (e.latencyMs ?? 1) + this.ert.get(e.id)!.extraLatencyMs;
  }

  private sample(): Metrics {
    const clients = [...this.nodes.values()].filter((n) => n.kind === 'client');
    const totalOffered = clients.reduce((s, c) => s + this.rt.get(c.id)!.inRps, 0);
    const latencies: number[] = [];
    let failed = 0;
    let total = 0;

    for (const c of clients) {
      const offered = this.rt.get(c.id)!.inRps;
      if (offered <= 0) continue;
      const n = Math.max(10, Math.round((this.samplesPerTick * offered) / Math.max(totalOffered, 1)));
      const timeout = c.config.timeoutMs ?? Infinity;
      let clientFailed = 0;
      for (let i = 0; i < n; i++) {
        const r = this.walk(c.id, 0);
        if (!r.ok || r.latency > timeout) clientFailed++;
        else latencies.push(r.latency);
      }
      failed += clientFailed;
      total += n;
      // Smoothed error rate feeds next tick's retry amplification.
      const prev = this.clientError.get(c.id) ?? 0;
      this.clientError.set(c.id, prev * 0.7 + (clientFailed / n) * 0.3);
    }

    this.window.push({ t: this.t, latencies, failed, total, offered: totalOffered });
    this.window = this.window.filter((w) => w.t > this.t - METRICS_WINDOW_SECONDS);

    const all = this.window.flatMap((w) => w.latencies).sort((a, b) => a - b);
    const sumFailed = this.window.reduce((s, w) => s + w.failed, 0);
    const sumTotal = this.window.reduce((s, w) => s + w.total, 0);
    const errorRate = sumTotal ? sumFailed / sumTotal : 0;
    const offered = this.window.reduce((s, w) => s + w.offered, 0) / this.window.length;

    return {
      offeredRps: offered,
      throughputRps: offered * (1 - errorRate),
      errorRate,
      p50Ms: percentile(all, 0.5),
      p95Ms: percentile(all, 0.95),
      p99Ms: percentile(all, 0.99),
    };
  }

  // ---------------------------------------------------------------- helpers

  private label(id: string): string {
    return this.nodes.get(id)?.label ?? id;
  }

  private edgeLabel(edgeId: string): string {
    for (const edges of this.out.values()) {
      const e = edges.find((x) => x.id === edgeId);
      if (e) return `${this.label(e.source)} -> ${this.label(e.target)}`;
    }
    return edgeId;
  }

  private emit(level: SimEvent['level'], message: string, ref: { nodeId?: string; edgeId?: string } = {}): void {
    this.events.push({ t: Math.round(this.t * 10) / 10, level, message, ...ref });
  }
}
