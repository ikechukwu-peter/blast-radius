import { Position } from '@xyflow/react';
import { KIND_LABELS, type Annotation, type Design, type DesignEdge, type DesignNode } from '@/core';
import { edgeGeometry, type Pt } from '@/lib/edgePath';
import { makeViewTransform } from '@/lib/viewTransform';

/**
 * Pure layout and timing for the video export: where everything sits in "world" units and when
 * it appears. The canvas renderer just draws this, so it is unit-tested without a browser.
 */

export type VideoFormat = 'landscape' | 'square' | 'vertical';
export const FORMATS: Record<VideoFormat, { width: number; height: number; label: string; hint: string }> = {
  landscape: { width: 1920, height: 1080, label: '16:9', hint: 'X, LinkedIn, YouTube' },
  square: { width: 1080, height: 1080, label: '1:1', hint: 'LinkedIn and Instagram feeds' },
  vertical: { width: 1080, height: 1920, label: '9:16', hint: 'Reels, Shorts, TikTok, Stories' },
};

/** World units: the editor's own coordinates (top-to-bottom for vertical video). */
export const ICON = 56;
const CARD_HALF_W = 88; // editor cards are 176 wide; their centre is where the icon goes
const CARD_HALF_H = 32;
const LABEL_BLOCK = 46; // label + type line under the icon

export interface WorldNode {
  id: string;
  node: DesignNode;
  center: Pt;
  label: string;
  /** The full type or service name, shown under the label. */
  sublabel: string;
  appearAt: number;
}

export interface WorldEdge {
  id: string;
  edge: DesignEdge;
  traffic: boolean;
  d: string;
  label?: Pt;
  revealAt: number;
}

export interface WorldAnnotation {
  a: Annotation;
  x: number;
  y: number;
  w: number;
  h: number;
  appearAt: number;
}

export interface Layout {
  nodes: WorldNode[];
  edges: WorldEdge[];
  annotations: WorldAnnotation[];
  /** World bounds of everything drawn. */
  bounds: { x: number; y: number; w: number; h: number };
  /** When the last thing finishes appearing. */
  builtAt: number;
}

const NODE_POP = 0.35;
const EDGE_DRAW = 0.45;

function anchor(c: Pt, side: string): { p: Pt; pos: Position } {
  const r = ICON / 2 + 6;
  switch (side) {
    case 't':
      return { p: { x: c.x, y: c.y - r }, pos: Position.Top };
    case 'b':
      return { p: { x: c.x, y: c.y + ICON / 2 + LABEL_BLOCK }, pos: Position.Bottom };
    case 'l':
      return { p: { x: c.x - r, y: c.y }, pos: Position.Left };
    default:
      return { p: { x: c.x + r, y: c.y }, pos: Position.Right };
  }
}

export function buildLayout(design: Design, opts: { vertical: boolean; rightAngles: boolean; start?: number }): Layout {
  // A 9:16 frame has the height the phone canvas lacks, so the flow axis is not squashed here.
  const vt = makeViewTransform(opts.vertical, 1);
  const start = opts.start ?? 0.6;

  const centers = new Map<string, Pt>();
  for (const n of design.nodes) {
    const p = vt.toView(n.position ?? { x: 0, y: 0 });
    // The editor card's top-left -> its centre. Only positions are transposed in the vertical
    // view, never the cards, so the offset is the same either way.
    centers.set(n.id, { x: p.x + CARD_HALF_W, y: p.y + CARD_HALF_H });
  }

  // Reveal in reading order: along the flow axis, then across it.
  const flow = (c: Pt) => (opts.vertical ? c.y : c.x);
  const across = (c: Pt) => (opts.vertical ? c.x : c.y);
  const ordered = [...design.nodes].sort((a, b) => {
    const ca = centers.get(a.id)!;
    const cb = centers.get(b.id)!;
    return Math.abs(flow(ca) - flow(cb)) > 40 ? flow(ca) - flow(cb) : across(ca) - across(cb);
  });
  const stagger = Math.min(0.14, 2.2 / Math.max(ordered.length, 1));
  const appear = new Map(ordered.map((n, i) => [n.id, start + i * stagger]));

  const nodes: WorldNode[] = ordered.map((n) => ({
    id: n.id,
    node: n,
    center: centers.get(n.id)!,
    label: n.label,
    sublabel: n.appearance?.typeLabel ?? KIND_LABELS[n.kind],
    appearAt: appear.get(n.id)!,
  }));

  const annotations: WorldAnnotation[] = (design.annotations ?? []).map((a, i) => {
    const p = vt.toView(a.position);
    const s = vt.sizeToView(a.width, a.height);
    return { a, x: p.x, y: p.y, w: s.width, h: s.height, appearAt: 0.15 + i * 0.08 };
  });

  const known = new Set(centers.keys());
  const edges: WorldEdge[] = design.edges
    .filter((e) => known.has(e.source) && known.has(e.target))
    .map((e) => {
      const s = anchor(centers.get(e.source)!, vt.handle(e.sourceHandle ?? 'r') ?? 'r');
      const t = anchor(centers.get(e.target)!, vt.handle(e.targetHandle ?? 'l') ?? 'l');
      const geo = edgeGeometry({
        source: s.p,
        target: t.p,
        sourcePosition: s.pos,
        targetPosition: t.pos,
        points: e.points?.map(vt.toView),
        style: opts.rightAngles ? 'step' : (e.pathStyle ?? 'smooth'),
      });
      return {
        id: e.id,
        edge: e,
        traffic: (e.kind ?? 'traffic') === 'traffic',
        d: geo.d,
        label: e.label ? geo.label : undefined,
        revealAt: Math.max(appear.get(e.source)!, appear.get(e.target)!) + NODE_POP * 0.6,
      };
    });

  // Bounds over nodes (with their labels) and annotations.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const n of nodes) {
    grow(n.center.x - 100, n.center.y - ICON / 2 - 10);
    grow(n.center.x + 100, n.center.y + ICON / 2 + LABEL_BLOCK + 10);
  }
  for (const a of annotations) {
    grow(a.x, a.y);
    grow(a.x + a.w, a.y + a.h);
  }
  if (!Number.isFinite(x0)) {
    x0 = y0 = 0;
    x1 = y1 = 100;
  }

  const lastNode = Math.max(start, ...nodes.map((n) => n.appearAt + NODE_POP));
  const lastEdge = Math.max(0, ...edges.map((e) => e.revealAt + EDGE_DRAW));
  return { nodes, edges, annotations, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, builtAt: Math.max(lastNode, lastEdge) };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Where a node's icon and caption sit, for keeping link labels off them. */
export function nodeBox(n: WorldNode): Box {
  return { x0: n.center.x - 80, y0: n.center.y - ICON / 2 - 4, x1: n.center.x + 80, y1: n.center.y + ICON / 2 + LABEL_BLOCK - 6 };
}

export const LABEL_H = 20;
/** Fractions along a link to try, middle first. */
export const LABEL_SPOTS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];

/**
 * Pick each link label's spot: the first candidate along its path that covers no node and no
 * label placed before it, else the middle. Candidates come in LABEL_SPOTS order.
 */
export function placeLabels(nodes: WorldNode[], labels: { id: string; width: number; candidates: Pt[] }[]): Map<string, Pt> {
  const taken: Box[] = nodes.map(nodeBox);
  const out = new Map<string, Pt>();
  for (const l of labels) {
    const box = (p: Pt): Box => ({ x0: p.x - l.width / 2 - 2, y0: p.y - LABEL_H / 2 - 2, x1: p.x + l.width / 2 + 2, y1: p.y + LABEL_H / 2 + 2 });
    const spot = l.candidates.find((p) => !taken.some((b) => overlaps(box(p), b))) ?? l.candidates[0];
    if (!spot) continue;
    out.set(l.id, spot);
    taken.push(box(spot));
  }
  return out;
}

/** Fit world bounds into the frame's content area (below the title, above the footer). */
export function fitTransform(bounds: Layout['bounds'], frame: { width: number; height: number }, chrome: { top: number; bottom: number; side: number }) {
  const availW = frame.width - chrome.side * 2;
  const availH = frame.height - chrome.top - chrome.bottom;
  const scale = Math.min(availW / bounds.w, availH / bounds.h, 2.2);
  const ox = chrome.side + (availW - bounds.w * scale) / 2 - bounds.x * scale;
  const oy = chrome.top + (availH - bounds.h * scale) / 2 - bounds.y * scale;
  return { scale, ox, oy };
}

/** 0..1 progress of an animation that starts at `at` and lasts `dur`, eased. */
export function progress(t: number, at: number, dur: number): number {
  const p = Math.min(1, Math.max(0, (t - at) / dur));
  return 1 - (1 - p) ** 3;
}

export const TIMING = { NODE_POP, EDGE_DRAW };
