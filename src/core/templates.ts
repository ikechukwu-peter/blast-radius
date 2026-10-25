import type { Design } from './types';

export interface Template {
  id: string;
  title: string;
  description: string;
  design: Design;
}

export const TEMPLATES: Template[] = [
  {
    id: 'naive',
    title: 'The Weekend Project',
    description: 'One server, one database. Works on launch day. Try 10x traffic.',
    design: {
      version: 1,
      nodes: [
        { id: 'users', kind: 'client', label: 'Users', config: { rps: 600 }, position: { x: 0, y: 120 } },
        { id: 'api', kind: 'api_server', label: 'API', config: { replicas: 1 }, position: { x: 260, y: 120 } },
        { id: 'db', kind: 'database', label: 'Postgres', position: { x: 520, y: 120 } },
      ],
      edges: [
        { id: 'e1', source: 'users', target: 'api', latencyMs: 20 },
        { id: 'e2', source: 'api', target: 'db' },
      ],
    },
  },
  {
    id: 'three-tier',
    title: 'Classic Three-Tier',
    description: 'Load balancer, API fleet, Redis, Postgres with a standby.',
    design: {
      version: 1,
      nodes: [
        { id: 'users', kind: 'client', label: 'Users', config: { rps: 2000, retries: 1 }, position: { x: 0, y: 160 } },
        { id: 'lb', kind: 'load_balancer', label: 'Load Balancer', config: { replicas: 2 }, position: { x: 220, y: 160 } },
        { id: 'api', kind: 'api_server', label: 'API', config: { replicas: 3, circuitBreaker: true }, position: { x: 440, y: 160 } },
        { id: 'cache', kind: 'cache', label: 'Redis', position: { x: 660, y: 80 } },
        { id: 'db', kind: 'database', label: 'Postgres', config: { replicas: 2, failoverSeconds: 30 }, position: { x: 880, y: 160 } },
      ],
      edges: [
        { id: 'e1', source: 'users', target: 'lb', latencyMs: 20 },
        { id: 'e2', source: 'lb', target: 'api' },
        { id: 'e3', source: 'api', target: 'cache' },
        { id: 'e4', source: 'cache', target: 'db' },
      ],
    },
  },
  {
    id: 'event-driven',
    title: 'Event-Driven Checkout',
    description: 'Payments go through a queue so a slow provider never blocks checkout.',
    design: {
      version: 1,
      nodes: [
        { id: 'users', kind: 'client', label: 'Shoppers', config: { rps: 1500, trafficPattern: 'spiky' }, position: { x: 0, y: 200 } },
        { id: 'cdn', kind: 'cdn', label: 'CDN', position: { x: 200, y: 200 } },
        { id: 'lb', kind: 'load_balancer', label: 'Load Balancer', config: { replicas: 2 }, position: { x: 400, y: 200 } },
        {
          id: 'api',
          kind: 'api_server',
          label: 'Checkout API',
          config: { replicas: 3, autoscale: { enabled: true, min: 3, max: 12, targetUtilization: 0.7, warmupSeconds: 15 } },
          position: { x: 600, y: 200 },
        },
        { id: 'cache', kind: 'cache', label: 'Redis', position: { x: 820, y: 80 } },
        { id: 'db', kind: 'database', label: 'Orders DB', config: { replicas: 2 }, position: { x: 1040, y: 80 } },
        { id: 'q', kind: 'queue', label: 'Payments Queue', position: { x: 820, y: 320 } },
        { id: 'worker', kind: 'worker', label: 'Payment Worker', config: { replicas: 3 }, position: { x: 1040, y: 320 } },
        { id: 'stripe', kind: 'external_api', label: 'Payment Provider', position: { x: 1260, y: 320 } },
      ],
      edges: [
        { id: 'e1', source: 'users', target: 'cdn', latencyMs: 20 },
        { id: 'e2', source: 'cdn', target: 'lb', latencyMs: 5 },
        { id: 'e3', source: 'lb', target: 'api' },
        { id: 'e4', source: 'api', target: 'cache' },
        { id: 'e5', source: 'cache', target: 'db' },
        { id: 'e6', source: 'api', target: 'q', weight: 0.3 },
        { id: 'e7', source: 'q', target: 'worker' },
        { id: 'e8', source: 'worker', target: 'stripe', latencyMs: 30 },
      ],
    },
  },
];
