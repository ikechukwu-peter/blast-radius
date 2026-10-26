// Blast Radius core types. Pure TypeScript, no framework dependencies.
// The UI (React Flow) maps its nodes/edges to these shapes.

export type NodeKind =
  | 'client'
  | 'cdn'
  | 'load_balancer'
  | 'api_server'
  | 'cache'
  | 'database'
  | 'queue'
  | 'worker'
  | 'external_api';

export type TrafficPattern = 'constant' | 'diurnal' | 'spiky';

export interface AutoscaleConfig {
  enabled: boolean;
  min: number;
  max: number;
  /** Scale out when utilization stays above this (0..1) for 10s. */
  targetUtilization: number;
  /** Seconds before a new replica starts taking traffic. */
  warmupSeconds: number;
}

export interface NodeConfig {
  replicas: number;
  /** Requests per second one replica can serve. */
  capacityPerReplica: number;
  /** Latency of one request at zero load. */
  baseLatencyMs: number;
  /** Intrinsic error ratio (0..1) even when healthy. */
  errorRate: number;
  /** cache / cdn: fraction of requests answered without going downstream. */
  hitRate?: number;
  /** queue: max buffered messages before new ones are dropped. */
  maxQueueDepth?: number;
  /** database: seconds to promote a standby after losing an instance. 0 = no automatic failover. */
  failoverSeconds?: number;
  /** api_server / worker. */
  autoscale?: AutoscaleConfig;
  /** client: requests per second generated. */
  rps?: number;
  /** client. */
  trafficPattern?: TrafficPattern;
  /** client: times a failed request is retried. */
  retries?: number;
  /** client: requests slower than this count as failures. */
  timeoutMs?: number;
  /** Caller-side circuit breaker on this node's outgoing calls. */
  circuitBreaker?: boolean;
}

/** Custom look for a component; its behaviour still comes from `kind`. */
export interface NodeAppearance {
  /** Shown instead of the kind's name, e.g. "Kafka" for a queue. */
  typeLabel?: string;
  /** Icon name from the UI's icon registry. */
  icon?: string;
  /** Accent colour (hex). */
  color?: string;
}

export interface DesignNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** UI only. Ignored by the engine. */
  appearance?: NodeAppearance;
  /** Missing fields fall back to KIND_DEFAULTS. */
  config?: Partial<NodeConfig>;
  /** UI only. Ignored by the engine. */
  position?: { x: number; y: number };
}

export interface DesignEdge {
  id: string;
  source: string;
  target: string;
  /**
   * Meaning depends on the source node:
   * - client / load_balancer ("split"): relative share of traffic (default 1).
   * - everything else ("fan-out"): fraction of requests that make this call, 0..1 (default 1).
   */
  weight?: number;
  /** Network latency of the hop (default 1ms). */
  latencyMs?: number;
  /**
   * 'traffic' (default) carries simulated requests from source to target.
   * 'annotation' is drawing only: the engine ignores it, so it may loop, point at a client,
   * duplicate another link or connect to a note.
   */
  kind?: 'traffic' | 'annotation';
  // ---- UI only; the engine ignores everything below ----
  label?: string;
  /** Which ends get an arrowhead. Requests still flow source -> target. */
  arrows?: 'end' | 'start' | 'both' | 'none';
  pathStyle?: 'smooth' | 'step' | 'straight';
  /** Bend points in canvas coordinates, in order from source to target. */
  points?: { x: number; y: number }[];
  sourceHandle?: string;
  targetHandle?: string;
  dashed?: boolean;
}

/** Drawing-only shapes: notes and grouping zones. The engine never sees them. */
export interface Annotation {
  id: string;
  /** text: a note; zone: a grouping box; stage: a labelled column (Ingestion, Data Lake, ...). */
  type: 'text' | 'zone' | 'stage';
  position: { x: number; y: number };
  width: number;
  height: number;
  text: string;
  color?: string;
  /** text only */
  fontSize?: 'sm' | 'md' | 'lg';
}

export interface Design {
  version: 1;
  nodes: DesignNode[];
  edges: DesignEdge[];
  /** UI only. Ignored by the engine. */
  annotations?: Annotation[];
}

export type NodeStatus = 'healthy' | 'degraded' | 'down' | 'failing_over';

export interface NodeRuntime {
  id: string;
  status: NodeStatus;
  activeReplicas: number;
  /** Sim times at which warming replicas become active. */
  warmingUntil: number[];
  inRps: number;
  servedRps: number;
  droppedRps: number;
  erroredRps: number;
  /** inRps / capacity. Can exceed 1 when overloaded. */
  utilization: number;
  /** Mean latency of this node right now. */
  latencyMs: number;
  /** queue only. */
  queueDepth: number;
  /** queue only: seconds of backlog at the current drain rate. */
  queueLagSec: number;
}

export interface EdgeRuntime {
  id: string;
  /** Requests per second delivered across this edge. */
  rps: number;
  /** Requests per second that tried this edge and failed (partition / open breaker). */
  failingRps: number;
  extraLatencyMs: number;
  partitioned: boolean;
  breakerOpen: boolean;
}

export interface Metrics {
  /** Requests per second sent by clients, including retries. */
  offeredRps: number;
  /** Successful requests per second. */
  throughputRps: number;
  /** 0..1 over the last simulated second. */
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface SimEvent {
  t: number;
  level: 'info' | 'warn' | 'critical';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface TickResult {
  t: number;
  nodes: Record<string, NodeRuntime>;
  edges: Record<string, EdgeRuntime>;
  metrics: Metrics;
  events: SimEvent[];
}

export type ChaosAction =
  /** Lose one instance. Last instance -> down. Databases with replicas fail over. */
  | { type: 'kill_instance'; nodeId: string }
  /** Whole node down, regardless of replicas. */
  | { type: 'outage'; nodeId: string }
  /** Capacity x0.3, latency x3. */
  | { type: 'degrade'; nodeId: string }
  | { type: 'recover'; nodeId: string }
  | { type: 'add_latency'; edgeId: string; ms: number }
  | { type: 'partition'; edgeId: string }
  /** Clears partition and extra latency on the edge. */
  | { type: 'heal'; edgeId: string }
  /** Multiplies all client traffic. 1 = normal. */
  | { type: 'traffic'; multiplier: number }
  | { type: 'recover_all' };
