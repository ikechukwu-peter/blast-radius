import { describe, expect, it } from 'vitest';
import { TEMPLATES, estimateMonthlyCost, reviewDesign, topologicalOrder, validateDesign, type Design } from '@/core';

const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.design;
const rules = (d: Design) => reviewDesign(d).findings.map((f) => f.ruleId);

describe('validateDesign', () => {
  it('accepts every template', () => {
    for (const t of TEMPLATES) expect(validateDesign(t.design), t.id).toEqual([]);
  });

  it('reports a missing client, cycles, self loops, dangling and inbound-client edges', () => {
    const d: Design = {
      version: 1,
      nodes: [
        { id: 'a', kind: 'api_server', label: 'A' },
        { id: 'b', kind: 'api_server', label: 'B' },
        { id: 'c', kind: 'client', label: 'C' },
      ],
      edges: [
        { id: '1', source: 'a', target: 'b' },
        { id: '2', source: 'b', target: 'a' },
        { id: '3', source: 'a', target: 'a' },
        { id: '4', source: 'a', target: 'ghost' },
        { id: '5', source: 'a', target: 'c' },
      ],
    };
    const codes = validateDesign(d).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['cycle', 'self_loop', 'dangling_edge', 'client_has_incoming']));
    expect(validateDesign({ version: 1, nodes: [], edges: [] }).map((i) => i.code)).toContain('no_client');
  });

  it('orders nodes so every edge points forward', () => {
    const d = tpl('event-driven');
    const order = topologicalOrder(d)!;
    const pos = new Map(order.map((id, i) => [id, i]));
    for (const e of d.edges) expect(pos.get(e.source)!).toBeLessThan(pos.get(e.target)!);
  });
});

describe('reviewDesign', () => {
  it('grades the single-server design poorly and names its single points of failure', () => {
    const r = reviewDesign(tpl('naive'));
    expect(r.grade).toBe('D');
    const spofs = r.findings.filter((f) => f.ruleId === 'SPOF').map((f) => f.nodeIds[0]);
    expect(spofs).toEqual(expect.arrayContaining(['api', 'db']));
    expect(rules(tpl('naive'))).toContain('NO_CACHE');
  });

  it('grades the three-tier design an A', () => {
    expect(reviewDesign(tpl('three-tier')).grade).toBe('A');
  });

  it('a replicated node behind a load balancer is not a single point of failure', () => {
    const d = tpl('three-tier');
    expect(reviewDesign(d).findings.some((f) => f.ruleId === 'SPOF' && f.nodeIds.includes('api'))).toBe(false);
  });

  it('flags retries without a breaker, consumerless queues, sync third parties and overload', () => {
    const d: Design = {
      version: 1,
      nodes: [
        { id: 'c', kind: 'client', label: 'C', config: { rps: 5000, retries: 2 } },
        { id: 'api', kind: 'api_server', label: 'API', config: { replicas: 2 } },
        { id: 'q', kind: 'queue', label: 'Q' },
        { id: 'x', kind: 'external_api', label: 'Payments' },
      ],
      edges: [
        { id: '1', source: 'c', target: 'api' },
        { id: '2', source: 'api', target: 'q', weight: 0.2 },
        { id: '3', source: 'api', target: 'x', weight: 0.2 },
      ],
    };
    expect(rules(d)).toEqual(expect.arrayContaining(['RETRY_STORM', 'QUEUE_NO_CONSUMER', 'SYNC_THIRD_PARTY', 'OVERLOADED']));
  });

  it('sorts findings by severity and scores within 0..100', () => {
    const r = reviewDesign(tpl('naive'));
    const order = ['critical', 'high', 'medium', 'low', 'info'];
    const idx = r.findings.map((f) => order.indexOf(f.severity));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('returns validation findings instead of simulating an invalid design', () => {
    const r = reviewDesign({ version: 1, nodes: [], edges: [] });
    expect(r.baseline).toBeNull();
    expect(r.findings[0].severity).toBe('critical');
  });
});

describe('estimateMonthlyCost', () => {
  it('bills replicas per component', () => {
    const { totalUsd, lines } = estimateMonthlyCost(tpl('naive'));
    expect(lines.find((l) => l.nodeId === 'api')!.monthlyUsd).toBe(70);
    expect(totalUsd).toBe(270);
  });
});
