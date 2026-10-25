// Run: npx tsx scripts/smoke.ts
// Sanity checks for the core engine. Exits non-zero if an expectation fails.
import { SCENARIOS, Simulation, TEMPLATES, reviewDesign, runScenario, validateDesign } from '../src/core';
import type { Design } from '../src/core';

let failures = 0;
function expect(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.design;

// 1. Baseline health
for (const t of TEMPLATES) {
  const sim = new Simulation(t.design);
  let last;
  for (let i = 0; i < 200; i++) last = sim.step(0.1);
  const m = last!.metrics;
  console.log(`\n[${t.id}] p50=${m.p50Ms.toFixed(0)}ms p99=${m.p99Ms.toFixed(0)}ms err=${pct(m.errorRate)} thr=${m.throughputRps.toFixed(0)}rps`);
  expect(m.errorRate < 0.05, `${t.id}: baseline error rate under 5%`);
  expect(validateDesign(t.design).length === 0, `${t.id}: valid`);
}

// 2. Overload: naive design at 10x should fail hard
{
  const sim = new Simulation(tpl('naive'));
  for (let i = 0; i < 50; i++) sim.step();
  sim.apply({ type: 'traffic', multiplier: 10 });
  let last;
  for (let i = 0; i < 50; i++) last = sim.step();
  console.log(`\n[naive @10x] err=${pct(last!.metrics.errorRate)} api util=${last!.nodes.api.utilization.toFixed(2)}`);
  expect(last!.metrics.errorRate > 0.5, 'naive @10x: majority of requests fail');
}

// 3. DB failover: three-tier recovers, naive does not
for (const id of ['three-tier', 'naive']) {
  const sim = new Simulation(tpl(id));
  for (let i = 0; i < 50; i++) sim.step();
  sim.apply({ type: 'kill_instance', nodeId: 'db' });
  let during, after;
  for (let i = 0; i < 100; i++) during = sim.step();
  for (let i = 0; i < 300; i++) after = sim.step();
  console.log(`\n[${id} db kill] during err=${pct(during!.metrics.errorRate)} after 40s err=${pct(after!.metrics.errorRate)} status=${after!.nodes.db.status}`);
  if (id === 'three-tier') expect(after!.metrics.errorRate < 0.05, 'three-tier recovers after failover');
  else expect(after!.metrics.errorRate > 0.9, 'naive stays down without failover');
}

// 4. Cache outage causes thundering herd on DB
{
  const sim = new Simulation(tpl('three-tier'));
  let before, after;
  for (let i = 0; i < 50; i++) before = sim.step();
  sim.apply({ type: 'outage', nodeId: 'cache' });
  for (let i = 0; i < 30; i++) after = sim.step();
  console.log(`\n[cache outage] db util ${before!.nodes.db.utilization.toFixed(2)} -> ${after!.nodes.db.utilization.toFixed(2)}`);
  expect(after!.nodes.db.utilization > before!.nodes.db.utilization * 3, 'db load jumps when cache dies');
}

// 5. Queue isolates slow third party
{
  const d = tpl('event-driven');
  const sim = new Simulation(d);
  for (let i = 0; i < 50; i++) sim.step();
  sim.apply({ type: 'add_latency', edgeId: 'e8', ms: 4000 });
  let last;
  for (let i = 0; i < 100; i++) last = sim.step();
  console.log(`\n[event-driven slow provider] p99=${last!.metrics.p99Ms.toFixed(0)}ms err=${pct(last!.metrics.errorRate)}`);
  expect(last!.metrics.p99Ms < 1000, 'queue keeps user latency low when provider is slow');
}

// 6. Determinism
{
  const a = runScenario(tpl('three-tier'), SCENARIOS[0]);
  const b = runScenario(tpl('three-tier'), SCENARIOS[0]);
  expect(a.score === b.score, `deterministic scoring (${a.score} === ${b.score})`);
}

// 7. Scenario scores
console.log('\nScenario scores (score / survived / worst p99 / avg err / cost):');
for (const t of TEMPLATES) {
  for (const s of SCENARIOS) {
    const r = runScenario(t.design, s);
    console.log(
      `  ${t.id.padEnd(13)} ${s.id.padEnd(15)} ${String(r.score).padStart(4)}  ${r.survived ? 'SURVIVED' : 'failed  '}  ${r.worstP99Ms.toFixed(0).padStart(5)}ms  ${pct(r.avgErrorRate).padStart(6)}  $${r.monthlyCostUsd}`,
    );
  }
}

// 8. Reviews
for (const t of TEMPLATES) {
  const r = reviewDesign(t.design);
  console.log(`\n[review ${t.id}] ${r.grade} (${r.score}) cost $${r.monthlyCostUsd}/mo`);
  for (const f of r.findings) console.log(`  ${f.severity.padEnd(8)} ${f.ruleId.padEnd(16)} ${f.title}`);
}
expect(reviewDesign(tpl('naive')).findings.some((f) => f.ruleId === 'SPOF'), 'naive flagged as SPOF');
expect(reviewDesign(tpl('naive')).score < reviewDesign(tpl('three-tier')).score, 'three-tier reviews better than naive');

// 9. Validation catches cycles
const cyclic: Design = {
  version: 1,
  nodes: [
    { id: 'c', kind: 'client', label: 'C' },
    { id: 'a', kind: 'api_server', label: 'A' },
    { id: 'b', kind: 'api_server', label: 'B' },
  ],
  edges: [
    { id: '1', source: 'c', target: 'a' },
    { id: '2', source: 'a', target: 'b' },
    { id: '3', source: 'b', target: 'a' },
  ],
};
expect(validateDesign(cyclic).some((i) => i.code === 'cycle'), 'cycle detected');

console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
