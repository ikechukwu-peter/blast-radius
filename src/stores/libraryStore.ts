import { create } from 'zustand';
import type { NodeConfig, NodeKind } from '@/core';
import { uid } from '@/lib/format';

/** A reusable component: a name, a look, and the built-in kind whose behaviour it borrows. */
export interface CustomComponent {
  id: string;
  name: string;
  blurb: string;
  kind: NodeKind;
  icon: string;
  color: string;
  config?: Partial<NodeConfig>;
  builtIn?: boolean;
}

export const STARTER_LIBRARY: CustomComponent[] = [
  { id: 'lib-stream', name: 'Event stream', blurb: 'Kafka, Kinesis, Pub/Sub', kind: 'queue', icon: 'stream', color: '#a78bfa', config: { capacityPerReplica: 200_000, maxQueueDepth: 1_000_000 }, builtIn: true },
  { id: 'lib-object', name: 'Object storage', blurb: 'S3, GCS, R2', kind: 'database', icon: 'storage', color: '#60a5fa', config: { replicas: 3, capacityPerReplica: 20_000, baseLatencyMs: 25, failoverSeconds: 5 }, builtIn: true },
  { id: 'lib-search', name: 'Search index', blurb: 'Elasticsearch, OpenSearch', kind: 'database', icon: 'search', color: '#f59e0b', config: { capacityPerReplica: 2000, baseLatencyMs: 15 }, builtIn: true },
  { id: 'lib-auth', name: 'Auth service', blurb: 'Sessions, tokens, SSO', kind: 'api_server', icon: 'lock', color: '#34d399', config: { replicas: 2, baseLatencyMs: 12 }, builtIn: true },
  { id: 'lib-payments', name: 'Payment provider', blurb: 'Stripe, Adyen, Paystack', kind: 'external_api', icon: 'card', color: '#f472b6', config: { baseLatencyMs: 300, errorRate: 0.005 }, builtIn: true },
  { id: 'lib-email', name: 'Email provider', blurb: 'SES, Postmark, Resend', kind: 'external_api', icon: 'mail', color: '#94a3b8', config: { baseLatencyMs: 200 }, builtIn: true },
  { id: 'lib-llm', name: 'LLM API', blurb: 'A hosted model, slow and rate-limited', kind: 'external_api', icon: 'brain', color: '#a78bfa', config: { baseLatencyMs: 1200, capacityPerReplica: 300, errorRate: 0.02 }, builtIn: true },
  { id: 'lib-gateway', name: 'API gateway', blurb: 'Routing, rate limits, auth', kind: 'load_balancer', icon: 'router', color: '#22d3ee', config: { replicas: 2, baseLatencyMs: 4 }, builtIn: true },
];

const KEY = 'br:library';

function load(): CustomComponent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((c) => c && typeof c.name === 'string' && typeof c.kind === 'string') : [];
  } catch {
    return [];
  }
}

function save(items: CustomComponent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage blocked: the library just won't persist */
  }
}

interface LibraryState {
  mine: CustomComponent[];
  upsert(c: Omit<CustomComponent, 'id'> & { id?: string }): CustomComponent;
  remove(id: string): void;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  mine: typeof localStorage === 'undefined' ? [] : load(),
  upsert(input) {
    const item: CustomComponent = { ...input, id: input.id ?? uid('lib-'), builtIn: false };
    const mine = get().mine.some((c) => c.id === item.id) ? get().mine.map((c) => (c.id === item.id ? item : c)) : [...get().mine, item];
    set({ mine });
    save(mine);
    return item;
  },
  remove(id) {
    const mine = get().mine.filter((c) => c.id !== id);
    set({ mine });
    save(mine);
  },
}));

export function findComponent(id: string): CustomComponent | undefined {
  return STARTER_LIBRARY.find((c) => c.id === id) ?? useLibrary.getState().mine.find((c) => c.id === id);
}
