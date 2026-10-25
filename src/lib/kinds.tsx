import { Cloud, Cog, Database, Globe, ListOrdered, Server, Split, Users, Zap, type LucideIcon } from 'lucide-react';
import type { NodeKind } from '@/core';

export const KIND_ICONS: Record<NodeKind, LucideIcon> = {
  client: Users,
  cdn: Globe,
  load_balancer: Split,
  api_server: Server,
  cache: Zap,
  database: Database,
  queue: ListOrdered,
  worker: Cog,
  external_api: Cloud,
};

export const KIND_BLURBS: Record<NodeKind, string> = {
  client: 'Generates traffic',
  cdn: 'Serves cached content at the edge',
  load_balancer: 'Spreads requests across healthy targets',
  api_server: 'Your application code',
  cache: 'Answers hits, forwards misses',
  database: 'Source of truth; can fail over',
  queue: 'Buffers async work',
  worker: 'Processes queued jobs',
  external_api: 'A third party you do not control',
};

export const PALETTE_ORDER: NodeKind[] = [
  'client',
  'cdn',
  'load_balancer',
  'api_server',
  'cache',
  'database',
  'queue',
  'worker',
  'external_api',
];

export const COLORS = {
  ok: '#22d3ee',
  warn: '#f59e0b',
  bad: '#f43f5e',
  good: '#34d399',
  muted: '#7b8499',
  border: '#1c2333',
  text: '#e6e9f0',
};
