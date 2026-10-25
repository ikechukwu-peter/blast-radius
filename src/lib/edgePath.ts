import { Position, getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react';

export type Pt = { x: number; y: number };
export type PathStyle = 'smooth' | 'step' | 'straight';

export interface EdgeGeometry {
  /** SVG path data. */
  d: string;
  /** Where the label sits. */
  label: Pt;
  /** The vertices the path passes through: source, bend points, target. */
  vertices: Pt[];
}

/** Insert an elbow so consecutive points join with horizontal-then-vertical segments. */
export function orthogonal(vertices: Pt[]): Pt[] {
  const out: Pt[] = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) {
    const a = out[out.length - 1];
    const b = vertices[i];
    if (a.x !== b.x && a.y !== b.y) out.push({ x: b.x, y: a.y });
    out.push(b);
  }
  return out;
}

export function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** The point halfway along a polyline. */
export function midpoint(pts: Pt[]): Pt {
  const half = polylineLength(pts) / 2;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (walked + seg >= half && seg > 0) {
      const t = (half - walked) / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    walked += seg;
  }
  return pts[0];
}

/** Catmull-Rom spline through every vertex, as cubic Béziers. */
export function splinePath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

const lineThrough = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x},${p.y}`).join(' ');

export function edgeGeometry(args: {
  source: Pt;
  target: Pt;
  sourcePosition: Position;
  targetPosition: Position;
  points?: Pt[];
  style?: PathStyle;
}): EdgeGeometry {
  const { source, target, sourcePosition, targetPosition, points = [], style = 'smooth' } = args;
  const base = { sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y, sourcePosition, targetPosition };

  if (!points.length) {
    const [d, lx, ly] =
      style === 'step' ? getSmoothStepPath({ ...base, borderRadius: 8 }) : style === 'straight' ? getStraightPath(base) : getBezierPath(base);
    return { d, label: { x: lx, y: ly }, vertices: [source, target] };
  }

  const vertices = [source, ...points, target];
  if (style === 'step') {
    const route = orthogonal(vertices);
    return { d: lineThrough(route), label: midpoint(route), vertices };
  }
  if (style === 'straight') return { d: lineThrough(vertices), label: midpoint(vertices), vertices };
  return { d: splinePath(vertices), label: midpoint(vertices), vertices };
}
