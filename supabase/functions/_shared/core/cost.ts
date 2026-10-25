import { MONTHLY_COST_PER_REPLICA, resolveConfig } from './defaults.ts';
import type { Design } from './types.ts';

export interface CostLine {
  nodeId: string;
  label: string;
  replicas: number;
  monthlyUsd: number;
}

export function estimateMonthlyCost(design: Design): { totalUsd: number; lines: CostLine[] } {
  const lines = design.nodes.map((n) => {
    const cfg = resolveConfig(n);
    // Autoscaled services are billed at their configured baseline; scale-outs are transient.
    const replicas = cfg.replicas;
    return { nodeId: n.id, label: n.label, replicas, monthlyUsd: MONTHLY_COST_PER_REPLICA[n.kind] * replicas };
  });
  return { totalUsd: lines.reduce((s, l) => s + l.monthlyUsd, 0), lines };
}
