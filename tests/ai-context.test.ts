import { describe, expect, it } from 'vitest';
import { SCENARIOS, Simulation, TEMPLATES, reviewDesign, runScenario } from '@/core';
import { SYSTEM_PROMPT, buildAnalysisContext, ranges } from '@/ai/context';

const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.design;

describe('ranges', () => {
  it('groups contiguous failing seconds', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7].map((t) => ({ t, bad: [2, 3, 6].includes(t) }));
    expect(ranges(xs, (x) => x.t, (x) => x.bad)).toEqual([
      [2, 3],
      [6, 6],
    ]);
  });
});

describe('buildAnalysisContext', () => {
  it('describes components, connections, cost and review in plain facts', () => {
    const d = tpl('naive');
    const text = buildAnalysisContext({ design: d, review: reviewDesign(d) });
    expect(text).toContain('API (API Server), replicas 1');
    expect(text).toContain('Users -> API (split)');
    expect(text).toContain('Monthly cost: $270');
    expect(text).toMatch(/grade D/);
    expect(text).toMatch(/\[critical\] Postgres is a single point of failure/);
  });

  it('includes live state for hot or unhealthy components only', () => {
    const d = tpl('naive');
    const sim = new Simulation(d);
    for (let i = 0; i < 30; i++) sim.step();
    sim.apply({ type: 'traffic', multiplier: 10 });
    let tick = sim.step();
    for (let i = 0; i < 30; i++) tick = sim.step();
    const text = buildAnalysisContext({ design: d, tick, activeChaos: ['Traffic 10x'] });
    expect(text).toMatch(/API: healthy, utilization \d{3,}%/);
    expect(text).toContain('Active chaos: Traffic 10x.');
    expect(text).toMatch(/Main bottleneck: API is OVERLOADED at \d{3,}% of capacity \(1 replica\), dropping \d+ rps\./);
    expect(text.indexOf('## Headline')).toBe(0);
    expect(text).toMatch(/Users sending 6000 rps \(configured 600 rps, 10\.0x\)/);
    expect(text).toMatch(/dropping \d+ rps/);
    expect(text).not.toMatch(/- Users:/);
  });

  it('summarises a challenge run with the seconds outside SLO', () => {
    const d = tpl('three-tier');
    const scenario = SCENARIOS.find((s) => s.id === 'black-friday')!;
    const result = runScenario(d, scenario);
    const text = buildAnalysisContext({ design: d, scenario, result });
    expect(text).toContain('## Challenge: Black Friday');
    expect(text).toContain(`score ${result.score}/1000, FAILED`);
    expect(text).toMatch(/Outside SLO during: \d+-\d+s/);
    expect(text).toMatch(/Failed Black Friday: \d+\.\d% of seconds within SLO \(needs 90\.0%\)/);
  });

  it('stays inside the small-model budget', () => {
    const d = tpl('event-driven');
    const scenario = SCENARIOS[0];
    const text = buildAnalysisContext({ design: d, review: reviewDesign(d), scenario, result: runScenario(d, scenario) });
    expect(text.length).toBeLessThanOrEqual(5000 + 20);
    expect(SYSTEM_PROMPT.length).toBeLessThan(2000);
  });
});
