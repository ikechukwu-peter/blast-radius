import { describe, expect, it } from 'vitest';
import { SCENARIOS, TEMPLATES, missingKinds, resolveScenarioAction, runScenario } from '@/core';
import { FORTRESS } from './fixtures/fortress';

const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.design;
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

describe('runScenario', () => {
  it('is deterministic: the same design and scenario always score the same', () => {
    const a = runScenario(tpl('three-tier'), scenario('primary-down'));
    const b = runScenario(tpl('three-tier'), scenario('primary-down'));
    expect(a.score).toBe(b.score);
    expect(a.seconds).toEqual(b.seconds);
  });

  // The leaderboard is only fair if every challenge can be won without blowing the budget.
  it.each(SCENARIOS.map((s) => [s.id]))('%s is beatable within budget by the reference design', (id) => {
    const r = runScenario(FORTRESS, scenario(id));
    expect(r.overBudget).toBe(false);
    expect(r.survived).toBe(true);
  });

  it('templates are not free wins', () => {
    expect(runScenario(tpl('three-tier'), scenario('black-friday')).survived).toBe(false);
    expect(runScenario(tpl('naive'), scenario('primary-down')).survived).toBe(false);
  });

  it('over-provisioning loses on cost', () => {
    const fat = structuredClone(FORTRESS);
    const api = fat.nodes.find((n) => n.id === 'api')!;
    api.config = { ...api.config, replicas: 40, autoscale: { enabled: true, min: 40, max: 40, targetUtilization: 0.5, warmupSeconds: 10 } };
    const r = runScenario(fat, scenario('black-friday'));
    expect(r.overBudget).toBe(true);
    expect(r.survived).toBe(false);
  });

  it('a design without the component a scenario targets is ineligible and scores 0', () => {
    expect(missingKinds(tpl('naive'), scenario('slow-provider'))).toEqual(['external_api']);
    const r = runScenario(tpl('naive'), scenario('slow-provider'));
    expect(r.eligible).toBe(false);
    expect(r.score).toBe(0);
  });

  it('records one entry per scenario second', () => {
    const s = scenario('cache-meltdown');
    expect(runScenario(tpl('three-tier'), s).seconds).toHaveLength(s.durationSec);
  });
});

describe('resolveScenarioAction', () => {
  const d = tpl('event-driven');

  it('targets nodes by kind, first or all', () => {
    expect(resolveScenarioAction(d, { type: 'kill_instance', target: { kind: 'database' } })).toEqual([{ type: 'kill_instance', nodeId: 'db' }]);
    expect(resolveScenarioAction(d, { type: 'degrade', target: { kind: 'api_server', which: 'all' } })).toHaveLength(1);
  });

  it('targets edges by the kind they point to', () => {
    expect(resolveScenarioAction(d, { type: 'add_latency', edges: { toKind: 'external_api' }, ms: 500 })).toEqual([
      { type: 'add_latency', edgeId: 'e8', ms: 500 },
    ]);
  });

  it('resolves to nothing when the design lacks the kind', () => {
    expect(resolveScenarioAction(tpl('naive'), { type: 'outage', target: { kind: 'cache' } })).toEqual([]);
  });
});
