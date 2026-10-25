import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { Simulation, TEMPLATES, reviewDesign, runScenario, SCENARIOS, simulatedDesign, trafficLinkProblem, validateDesign, type Design } from '@/core';
import { edgeGeometry, midpoint, orthogonal, polylineLength } from '@/lib/edgePath';

const tpl = (id: string) => structuredClone(TEMPLATES.find((t) => t.id === id)!.design);

/** Three-tier plus every kind of drawing-only extra. */
function decorated(): Design {
  const d = tpl('three-tier');
  d.annotations = [
    { id: 'z', type: 'zone', position: { x: 0, y: 0 }, width: 400, height: 200, text: 'VPC' },
    { id: 'n', type: 'text', position: { x: 0, y: -80 }, width: 200, height: 40, text: 'Replicates nightly' },
  ];
  d.edges.push(
    { id: 'loop', source: 'db', target: 'api', kind: 'annotation', label: 'replication lag', arrows: 'both' },
    { id: 'toClient', source: 'api', target: 'users', kind: 'annotation' },
    { id: 'toNote', source: 'db', target: 'n', kind: 'annotation' },
  );
  d.nodes[0].appearance = { typeLabel: 'Mobile app', icon: 'phone', color: '#f472b6' };
  return d;
}

describe('drawing-only parts never reach the engine', () => {
  it('simulatedDesign drops annotation links and shapes', () => {
    const s = simulatedDesign(decorated());
    expect(s.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(s.annotations).toBeUndefined();
  });

  it('a decorated design with loops and links to notes is still valid', () => {
    expect(validateDesign(decorated())).toEqual([]);
  });

  it('simulation, review and scenario scores are identical with or without decoration', () => {
    const plain = tpl('three-tier');
    const fancy = decorated();
    const run = (d: Design) => {
      const sim = new Simulation(d, { seed: 3 });
      let t;
      for (let i = 0; i < 50; i++) t = sim.step();
      return t!.metrics;
    };
    expect(run(fancy)).toEqual(run(plain));
    expect(reviewDesign(fancy).score).toBe(reviewDesign(plain).score);
    const s = SCENARIOS.find((x) => x.id === 'primary-down')!;
    expect(runScenario(fancy, s).score).toBe(runScenario(plain, s).score);
  });

  it('arrowheads are visual: a "both" traffic link still flows source to target', () => {
    const d = tpl('naive');
    d.edges[0].arrows = 'both';
    const sim = new Simulation(d);
    let t;
    for (let i = 0; i < 10; i++) t = sim.step();
    expect(t!.edges.e1.rps).toBeGreaterThan(500);
  });
});

describe('trafficLinkProblem', () => {
  const d = tpl('three-tier');
  it('allows a new forward link', () => {
    expect(trafficLinkProblem(d, 'api', 'db')).toBeNull();
  });
  it('refuses loops, links into clients, duplicates, self-links and notes', () => {
    expect(trafficLinkProblem(d, 'db', 'api')).toMatch(/loop/);
    expect(trafficLinkProblem(d, 'api', 'users')).toMatch(/Clients/);
    expect(trafficLinkProblem(d, 'lb', 'api')).toMatch(/already/);
    expect(trafficLinkProblem(d, 'api', 'api')).toMatch(/itself/);
    expect(trafficLinkProblem(d, 'api', 'note-1')).toMatch(/drawing-only/);
  });
  it('ignores existing drawing-only links when checking for loops', () => {
    const withNote = decorated();
    expect(trafficLinkProblem(withNote, 'api', 'db')).toBeNull();
  });
});

describe('edge geometry', () => {
  const base = { source: { x: 0, y: 0 }, target: { x: 100, y: 100 }, sourcePosition: Position.Right, targetPosition: Position.Left };

  it('passes through every bend point', () => {
    const g = edgeGeometry({ ...base, points: [{ x: 50, y: -40 }], style: 'straight' });
    expect(g.d).toBe('M 0,0 L 50,-40 L 100,100');
    expect(g.vertices).toHaveLength(3);
  });

  it('right-angle routes only use horizontal and vertical segments', () => {
    const route = orthogonal([{ x: 0, y: 0 }, { x: 50, y: 30 }, { x: 100, y: 100 }]);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it('curved routes with bends start and end on the handles', () => {
    const g = edgeGeometry({ ...base, points: [{ x: 50, y: -40 }], style: 'smooth' });
    expect(g.d.startsWith('M 0,0')).toBe(true);
    expect(g.d.endsWith('100,100')).toBe(true);
  });

  it('places the label halfway along the path', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(polylineLength(pts)).toBe(200);
    expect(midpoint(pts)).toEqual({ x: 100, y: 0 });
  });

  it('without bends, uses React Flow’s own path helpers', () => {
    for (const style of ['smooth', 'step', 'straight'] as const) expect(edgeGeometry({ ...base, style }).d.length).toBeGreaterThan(10);
  });
});
