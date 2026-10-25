import type { Review, Severity } from '@/core';
import { COLORS } from '@/lib/kinds';

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: COLORS.bad,
  high: COLORS.bad,
  medium: COLORS.warn,
  low: COLORS.ok,
  info: COLORS.muted,
};

export function gradeColor(grade: Review['grade']) {
  return grade === 'A' ? COLORS.good : grade === 'B' ? COLORS.ok : grade === 'F' ? COLORS.bad : COLORS.warn;
}
