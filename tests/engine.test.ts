import { describe, expect, it } from 'vitest';
import { Simulation, TEMPLATES, retryAmplification, trafficPatternMultiplier, type Design, type TickResult } from '@/core';

const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.design;

function run(sim: Simulation, seconds: number): TickResult {
  let last!: TickResult;
  for (let i = 0; i < seconds * 10; i++) last = sim.step(0.1);
  return last;
}

/** client -> api -> db, with knobs. */
function chain(opts: { rps?: number; apiReplicas?: number; dbReplicas?: number; failover?: number; retries?: number; breaker?: boolean } = {}): Design {
  return {
    version: 1,
    nodes: [
      { id: 'c', kind: 'client', label: 'Clients', config: { rps: opts.rps ?? 1000, retries: opts.retries ?? 0 } },
      { id: 'api', kind: 'api_server', label: 'API', config: { replicas: opts.apiReplicas ?? 2, circuitBreaker: opts.breaker ?? false } },
      { id: 'db', kind: 'database', label: 'DB', config: { replicas: opts.dbReplicas ?? 1, failoverSeconds: opts.failover ?? 30 } },
    ],
    edges: [
      { id: 'e1', source: 'c', target: 'api' },
      { id: 'e2', source: 'api', target: 'db' },
    ],
  };
}

describe('helpers', () => {
  it('retry amplification is a geometric series capped below 1', () => {
    expect(retryAmplification(0, 3)).toBe(1);
    expect(retryAmplification(0.5, 2)).toBeCloseTo(1.75);
    expect(retryAmplification(5, 1)).toBeCloseTo(1.99); // error rate clamped to 0.99
  });

  it('traffic patterns follow their documented shape', () => {
    expect(trafficPatternMultiplier('constant', 12)).toBe(1);
    expect(trafficPatternMultiplier('diurnal', 15)).toBeCloseTo(1.5);
    expect(trafficPatternMultiplier('diurnal', 45)).toBeCloseTo(0.5);
    expect(trafficPatternMultiplier('spiky', 1)).toBe(3);
    expect(trafficPatternMultiplier('spiky', 10)).toBe(1);
  });
});

describe('Simulation', () => {
  it('rejects cyclic designs', () => {
    const d = chain();
    d.edges.push({ id: 'loop', source: 'db', target: 'api' });
    expect(() => new Simulation(d)).toThrow(/cycle/);
  });

  it('is deterministic for a given seed', () => {
    const a = run(new Simulation(tpl('three-tier'), { seed: 9 }), 10).metrics;
    const b = run(new Simulation(tpl('three-tier'), { seed: 9 }), 10).metrics;
    expect(a).toEqual(b);
  });

  it('every template is healthy at baseline', () => {
    for (const t of TEMPLATES) {
      const m = run(new Simulation(t.design), 20).metrics;
      expect(m.errorRate, t.id).toBeLessThan(0.05);
      expect(m.p99Ms, t.id).toBeLessThan(500);
    }
  });

  it('latency climbs and requests drop past capacity', () => {
    const calm = run(new Simulation(chain({ rps: 500 })), 5).nodes.api;
    const hot = run(new Simulation(chain({ rps: 1900 })), 5).nodes.api;
    const over = run(new Simulation(chain({ rps: 4000 })), 5);
    expect(hot.latencyMs).toBeGreaterThan(calm.latencyMs * 5);
    expect(over.nodes.api.droppedRps).toBeCloseTo(2000, -2);
    expect(over.metrics.errorRate).toBeGreaterThan(0.4);
  });

  it('a 10x spike melts a single-server design', () => {
    const sim = new Simulation(tpl('naive'));
    run(sim, 5);
    sim.apply({ type: 'traffic', multiplier: 10 });
    expect(run(sim, 5).metrics.errorRate).toBeGreaterThan(0.5);
  });

  it('a database with a standby fails over and recovers; a lone one stays down', () => {
    const ha = new Simulation(chain({ dbReplicas: 2, failover: 10 }));
    run(ha, 5);
    ha.apply({ type: 'kill_instance', nodeId: 'db' });
    expect(run(ha, 3).nodes.db.status).toBe('failing_over');
    const after = run(ha, 15);
    expect(after.nodes.db.status).toBe('healthy');
    expect(after.metrics.errorRate).toBeLessThan(0.05);

    const solo = new Simulation(chain({ dbReplicas: 1 }));
    run(solo, 5);
    solo.apply({ type: 'kill_instance', nodeId: 'db' });
    expect(run(solo, 20).metrics.errorRate).toBeGreaterThan(0.9);
  });

  it('a dead cache falls through to the database (thundering herd)', () => {
    const sim = new Simulation(tpl('three-tier'));
    const before = run(sim, 5).nodes.db.utilization;
    sim.apply({ type: 'outage', nodeId: 'cache' });
    const after = run(sim, 3);
    expect(after.nodes.db.utilization).toBeGreaterThan(before * 3);
    // Requests fall through to the database instead of failing at the dead cache.
    expect(after.metrics.errorRate).toBeLessThan(0.05);
  });

  it('a queue isolates users from a slow third party', () => {
    const sim = new Simulation(tpl('event-driven'));
    run(sim, 5);
    sim.apply({ type: 'add_latency', edgeId: 'e8', ms: 4000 });
    const m = run(sim, 10).metrics;
    expect(m.p99Ms).toBeLessThan(1000);
    expect(m.errorRate).toBeLessThan(0.02);
  });

  it('a partitioned edge fails requests that need it', () => {
    const sim = new Simulation(chain());
    run(sim, 3);
    sim.apply({ type: 'partition', edgeId: 'e2' });
    const t = run(sim, 3);
    expect(t.edges.e2.partitioned).toBe(true);
    expect(t.edges.e2.failingRps).toBeGreaterThan(0);
    expect(t.metrics.errorRate).toBeGreaterThan(0.9);
    sim.apply({ type: 'heal', edgeId: 'e2' });
    expect(run(sim, 5).metrics.errorRate).toBeLessThan(0.05);
  });

  it('a load balancer routes around a dead backend', () => {
    const d: Design = {
      version: 1,
      nodes: [
        { id: 'c', kind: 'client', label: 'C', config: { rps: 800 } },
        { id: 'lb', kind: 'load_balancer', label: 'LB', config: { replicas: 2 } },
        { id: 'a', kind: 'api_server', label: 'A', config: { replicas: 2 } },
        { id: 'b', kind: 'api_server', label: 'B', config: { replicas: 2 } },
      ],
      edges: [
        { id: '1', source: 'c', target: 'lb' },
        { id: '2', source: 'lb', target: 'a' },
        { id: '3', source: 'lb', target: 'b' },
      ],
    };
    const sim = new Simulation(d);
    run(sim, 3);
    sim.apply({ type: 'outage', nodeId: 'a' });
    const t = run(sim, 3);
    expect(t.edges['2'].rps).toBe(0);
    expect(t.edges['3'].rps).toBeCloseTo(800, -1);
    expect(t.metrics.errorRate).toBeLessThan(0.02);
  });

  it('retries amplify load on a struggling dependency', () => {
    const offered = (retries: number) => {
      const sim = new Simulation(chain({ rps: 1500, retries }));
      run(sim, 3);
      sim.apply({ type: 'degrade', nodeId: 'api' });
      return run(sim, 8).nodes.api.inRps;
    };
    expect(offered(3)).toBeGreaterThan(offered(0) * 1.4);
  });

  it('a circuit breaker opens on a failing dependency and fails fast', () => {
    const sim = new Simulation(chain({ breaker: true }));
    run(sim, 3);
    sim.apply({ type: 'outage', nodeId: 'db' });
    const t = run(sim, 2);
    expect(t.edges.e2.breakerOpen).toBe(true);
    expect(t.edges.e2.rps).toBe(0);
  });

  it('autoscaling adds replicas after sustained load, after warm-up', () => {
    const d = chain({ rps: 1500 });
    d.nodes[1].config = { replicas: 2, autoscale: { enabled: true, min: 2, max: 10, targetUtilization: 0.6, warmupSeconds: 5 } };
    const sim = new Simulation(d);
    expect(run(sim, 9).nodes.api.activeReplicas).toBe(2);
    const warming = run(sim, 3).nodes.api;
    expect(warming.warmingUntil.length).toBeGreaterThan(0);
    expect(run(sim, 6).nodes.api.activeReplicas).toBeGreaterThan(2);
  });

  it('a queue backs up when workers fall behind, then drops at max depth', () => {
    const d: Design = {
      version: 1,
      nodes: [
        { id: 'c', kind: 'client', label: 'C', config: { rps: 2000 } },
        { id: 'q', kind: 'queue', label: 'Q', config: { maxQueueDepth: 5000 } },
        { id: 'w', kind: 'worker', label: 'W', config: { replicas: 1, capacityPerReplica: 500 } },
      ],
      edges: [
        { id: '1', source: 'c', target: 'q' },
        { id: '2', source: 'q', target: 'w' },
      ],
    };
    const sim = new Simulation(d);
    const early = run(sim, 2).nodes.q;
    expect(early.queueDepth).toBeGreaterThan(2000);
    const later = run(sim, 5).nodes.q;
    expect(later.queueDepth).toBe(5000);
    expect(later.droppedRps).toBeGreaterThan(1000);
  });

  it('recover_all clears every chaos action', () => {
    const sim = new Simulation(tpl('three-tier'));
    run(sim, 2);
    sim.apply({ type: 'outage', nodeId: 'db' });
    sim.apply({ type: 'partition', edgeId: 'e2' });
    sim.apply({ type: 'traffic', multiplier: 5 });
    sim.apply({ type: 'recover_all' });
    const t = run(sim, 5);
    expect(t.nodes.db.status).toBe('healthy');
    expect(t.edges.e2.partitioned).toBe(false);
    expect(t.metrics.errorRate).toBeLessThan(0.05);
  });
});
