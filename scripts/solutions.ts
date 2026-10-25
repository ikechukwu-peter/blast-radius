// Run: npx tsx scripts/solutions.ts
// Proves every scenario is beatable within budget. Contains spoilers; do not ship to the client.
import { SCENARIOS, runScenario, reviewDesign } from '../src/core';
import type { Design } from '../src/core';

export const FORTRESS: Design = {
  version: 1,
  nodes: [
    { id: 'users', kind: 'client', label: 'Users', config: { rps: 2000, retries: 1, timeoutMs: 2000 } },
    { id: 'cdn', kind: 'cdn', label: 'CDN', config: { replicas: 2 } },
    { id: 'lb', kind: 'load_balancer', label: 'LB', config: { replicas: 2 } },
    { id: 'api', kind: 'api_server', label: 'API', config: { replicas: 10, circuitBreaker: true,
      autoscale: { enabled: true, min: 10, max: 40, targetUtilization: 0.5, warmupSeconds: 10 } } },
    { id: 'cache', kind: 'cache', label: 'Redis', config: { replicas: 2 } },
    { id: 'db', kind: 'database', label: 'Postgres', config: { replicas: 3, failoverSeconds: 10 } },
    { id: 'q', kind: 'queue', label: 'Queue' },
    { id: 'worker', kind: 'worker', label: 'Worker', config: { replicas: 3, circuitBreaker: true } },
    { id: 'ext', kind: 'external_api', label: 'Provider' },
  ],
  edges: [
    { id: 'e1', source: 'users', target: 'cdn', latencyMs: 20 },
    { id: 'e2', source: 'cdn', target: 'lb', latencyMs: 5 },
    { id: 'e3', source: 'lb', target: 'api' },
    { id: 'e4', source: 'api', target: 'cache' },
    { id: 'e5', source: 'cache', target: 'db' },
    { id: 'e6', source: 'api', target: 'q', weight: 0.3 },
    { id: 'e7', source: 'q', target: 'worker' },
    { id: 'e8', source: 'worker', target: 'ext' },
  ],
};

if (process.argv[1]?.endsWith('solutions.ts')) main();

function main() {
const review = reviewDesign(FORTRESS);
console.log(`review: ${review.grade} ${review.score}, $${review.monthlyCostUsd}/mo`);
for (const f of review.findings) console.log(`  ${f.severity} ${f.ruleId} ${f.title}`);
let ok = true;
for (const s of SCENARIOS) {
  const r = runScenario(FORTRESS, s);
  console.log(`${s.id.padEnd(15)} score=${r.score} survived=${r.survived} slo=${(r.sloAttainment*100).toFixed(0)}% p99max=${r.worstP99Ms.toFixed(0)} err=${(r.avgErrorRate*100).toFixed(1)}% cost=$${r.monthlyCostUsd}/${s.goals.maxMonthlyCostUsd}`);
  if (!r.survived) {
    ok = false;
    for (const sec of r.seconds.filter((x) => !x.withinSlo).slice(0, 8))
      console.log(`    t=${sec.t} p99=${sec.metrics.p99Ms.toFixed(0)} err=${(sec.metrics.errorRate*100).toFixed(1)}%`);
  }
}
process.exit(ok ? 0 : 1);
}
