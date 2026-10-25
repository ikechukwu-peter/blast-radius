import type { DesignNode, NodeConfig, NodeKind } from './types.ts';

const noAutoscale = { enabled: false, min: 2, max: 10, targetUtilization: 0.7, warmupSeconds: 20 };

export const KIND_DEFAULTS: Record<NodeKind, NodeConfig> = {
  client: {
    replicas: 1,
    capacityPerReplica: 1e9,
    baseLatencyMs: 0,
    errorRate: 0,
    rps: 2000,
    trafficPattern: 'constant',
    retries: 0,
    timeoutMs: 3000,
  },
  cdn: { replicas: 1, capacityPerReplica: 200_000, baseLatencyMs: 15, errorRate: 0, hitRate: 0.6 },
  load_balancer: { replicas: 1, capacityPerReplica: 50_000, baseLatencyMs: 1, errorRate: 0 },
  api_server: {
    replicas: 3,
    capacityPerReplica: 1000,
    baseLatencyMs: 20,
    errorRate: 0.001,
    circuitBreaker: false,
    autoscale: { ...noAutoscale },
  },
  cache: { replicas: 1, capacityPerReplica: 100_000, baseLatencyMs: 1, errorRate: 0, hitRate: 0.8 },
  database: { replicas: 1, capacityPerReplica: 3000, baseLatencyMs: 8, errorRate: 0, failoverSeconds: 30 },
  queue: { replicas: 1, capacityPerReplica: 50_000, baseLatencyMs: 3, errorRate: 0, maxQueueDepth: 100_000 },
  worker: {
    replicas: 2,
    capacityPerReplica: 500,
    baseLatencyMs: 50,
    errorRate: 0.001,
    circuitBreaker: false,
    autoscale: { ...noAutoscale, min: 1 },
  },
  external_api: { replicas: 1, capacityPerReplica: 2000, baseLatencyMs: 150, errorRate: 0.01 },
};

/** Monthly USD per replica. Used for the cost-vs-reliability trade-off. */
export const MONTHLY_COST_PER_REPLICA: Record<NodeKind, number> = {
  client: 0,
  cdn: 200,
  load_balancer: 25,
  api_server: 70,
  cache: 50,
  database: 200,
  queue: 40,
  worker: 60,
  external_api: 0,
};

export const KIND_LABELS: Record<NodeKind, string> = {
  client: 'Clients',
  cdn: 'CDN',
  load_balancer: 'Load Balancer',
  api_server: 'API Server',
  cache: 'Cache (Redis)',
  database: 'Database (Postgres)',
  queue: 'Queue',
  worker: 'Worker',
  external_api: 'External API',
};

/** Which config fields the properties panel should show for each kind. */
export const EDITABLE_FIELDS: Record<NodeKind, (keyof NodeConfig)[]> = {
  client: ['rps', 'trafficPattern', 'retries', 'timeoutMs'],
  cdn: ['hitRate', 'baseLatencyMs'],
  load_balancer: ['replicas', 'capacityPerReplica'],
  api_server: ['replicas', 'capacityPerReplica', 'baseLatencyMs', 'errorRate', 'circuitBreaker', 'autoscale'],
  cache: ['replicas', 'hitRate', 'capacityPerReplica'],
  database: ['replicas', 'capacityPerReplica', 'baseLatencyMs', 'failoverSeconds'],
  queue: ['maxQueueDepth', 'capacityPerReplica'],
  worker: ['replicas', 'capacityPerReplica', 'baseLatencyMs', 'circuitBreaker', 'autoscale'],
  external_api: ['baseLatencyMs', 'errorRate', 'capacityPerReplica'],
};

export function resolveConfig(node: DesignNode): NodeConfig {
  const base = KIND_DEFAULTS[node.kind];
  const merged: NodeConfig = { ...base, ...(node.config ?? {}) };
  if (base.autoscale) merged.autoscale = { ...base.autoscale, ...(node.config?.autoscale ?? {}) };
  return merged;
}

/** Split nodes send each request to ONE child. Everything else fans out to ALL children. */
export function isSplitKind(kind: NodeKind): boolean {
  return kind === 'client' || kind === 'load_balancer';
}
