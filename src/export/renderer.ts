import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Simulation, validateDesign, type Design, type NodeKind } from '@/core';
import { cloudIconUrl } from '@/lib/cloudCatalog';
import { ICONS } from '@/lib/icons';
import { KIND_ICONS } from '@/lib/kinds';
import { FORMATS, ICON, LABEL_H, LABEL_SPOTS, TIMING, buildLayout, fitTransform, placeLabels, progress, type Layout, type VideoFormat } from './layout';

/**
 * Draws a design as a poster-style animated diagram on a 2D canvas: stage columns, big icons with
 * names under them, flowing dashed arrows and traffic particles. Used for both the live preview
 * and the MP4 encode, so what you preview is exactly what you get.
 */

export interface VideoOptions {
  format: VideoFormat;
  title: string;
  duration: number;
  rightAngles: boolean;
  particles: boolean;
  endCard: boolean;
}

type Pt = { x: number; y: number };

export interface Scene {
  opts: VideoOptions;
  frame: { width: number; height: number };
  layout: Layout;
  tf: { scale: number; ox: number; oy: number };
  k: number;
  icons: Map<string, { img: HTMLImageElement; tile: boolean; color: string }>;
  samples: Map<string, { pts: Pt[]; len: number }>;
  particleCount: Map<string, number>;
  /** Link label positions, nudged off nodes and each other. */
  labelAt: Map<string, Pt>;
}

const BG = '#07090f';
const TEXT = '#f3f4f8';
const MUTED = '#8a93a8';
const CYAN = '#22d3ee';
const LABEL_FONT = '600 11.5px Inter, sans-serif';
const URL = 'blastradius.ikechukwupeter.com';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function lucideImage(name: string | undefined, fallback: NodeKind, color: string) {
  const Icon = (name && ICONS[name]) || KIND_ICONS[fallback];
  const svg = renderToStaticMarkup(createElement(Icon, { size: 96, color, strokeWidth: 1.8 }));
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`);
}

function samplePath(d: string): { pts: Pt[]; len: number } {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  const len = path.getTotalLength();
  const n = Math.max(24, Math.ceil(len / 6));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAtLength((len * i) / n);
    pts.push({ x: p.x, y: p.y });
  }
  return { pts, len };
}

function pointAt(s: { pts: Pt[] }, u: number): Pt {
  const f = Math.min(Math.max(u, 0), 1) * (s.pts.length - 1);
  const i = Math.floor(f);
  const a = s.pts[i];
  const b = s.pts[Math.min(i + 1, s.pts.length - 1)];
  return { x: a.x + (b.x - a.x) * (f - i), y: a.y + (b.y - a.y) * (f - i) };
}

export async function prepareScene(design: Design, opts: VideoOptions): Promise<Scene> {
  await Promise.all(['400', '600', '700', '800'].map((w) => document.fonts.load(`${w} 20px Inter`).catch(() => [])));
  const frame = { width: FORMATS[opts.format].width, height: FORMATS[opts.format].height };
  const k = Math.min(frame.width, frame.height) / 1080;
  const layout = buildLayout(design, { vertical: opts.format === 'vertical', rightAngles: opts.rightAngles });
  const tf = fitTransform(layout.bounds, frame, { top: 150 * k, bottom: 96 * k, side: 64 * k });

  const icons: Scene['icons'] = new Map();
  await Promise.all(
    layout.nodes.map(async (n) => {
      const cloud = cloudIconUrl(n.node.appearance?.icon);
      const color = n.node.appearance?.color ?? CYAN;
      try {
        const img = cloud ? await loadImage(cloud) : await lucideImage(n.node.appearance?.icon, n.node.kind, color);
        icons.set(n.id, { img, tile: !cloud, color });
      } catch {
        /* draw without an icon */
      }
    }),
  );

  const samples: Scene['samples'] = new Map(layout.edges.map((e) => [e.id, samplePath(e.d)]));
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = LABEL_FONT;
  const labelAt = placeLabels(
    layout.nodes,
    layout.edges
      .filter((e) => e.label && e.edge.label)
      .map((e) => ({ id: e.id, width: measure.measureText(e.edge.label!).width + 14, candidates: LABEL_SPOTS.map((u) => pointAt(samples.get(e.id)!, u)) })),
  );

  // Particle density from a short headless run, so busy links look busy.
  const particleCount: Scene['particleCount'] = new Map();
  if (!validateDesign(design).length) {
    const sim = new Simulation(design, { seed: 11, samplesPerTick: 40 });
    let tick = sim.step();
    for (let i = 0; i < 40; i++) tick = sim.step();
    for (const e of layout.edges) {
      const rps = tick.edges[e.id]?.rps ?? 0;
      particleCount.set(e.id, e.traffic && rps > 0 ? Math.max(1, Math.min(4, Math.round(Math.log10(rps + 1) * 1.1))) : 0);
    }
  }
  return { opts, frame, layout, tf, k, icons, samples, particleCount, labelAt };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = r * 0.09;
  ctx.strokeStyle = 'rgba(34,211,238,0.35)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.81, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(34,211,238,0.75)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.47, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.19, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function arrowHead(ctx: CanvasRenderingContext2D, tip: Pt, from: Pt, size: number, color: string) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(tip.x, tip.y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.55);
  ctx.lineTo(-size, size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, t: number) {
  const { frame, k, layout, tf, opts } = scene;
  const W = frame.width;
  const H = frame.height;
  const centred = opts.format !== 'landscape';

  // ---------------------------------------------------------------- background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glowA = ctx.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, W * 0.6);
  glowA.addColorStop(0, 'rgba(34,211,238,0.10)');
  glowA.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, W, H);
  const glowB = ctx.createRadialGradient(W * 0.9, H * 0.95, 0, W * 0.9, H * 0.95, W * 0.6);
  glowB.addColorStop(0, 'rgba(244,63,94,0.08)');
  glowB.addColorStop(1, 'rgba(244,63,94,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  const gap = 36 * k;
  for (let x = gap / 2; x < W; x += gap) for (let y = gap / 2; y < H; y += gap) ctx.fillRect(x, y, 1.6 * k, 1.6 * k);

  // ---------------------------------------------------------------- title
  const titleIn = progress(t, 0, 0.6);
  ctx.globalAlpha = titleIn;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = TEXT;
  ctx.font = `800 ${46 * k}px Inter, sans-serif`;
  ctx.textAlign = centred ? 'center' : 'left';
  const tx = centred ? W / 2 : 64 * k;
  ctx.fillText(opts.title || 'System design', tx, 86 * k, W - 128 * k);
  ctx.font = `500 ${21 * k}px Inter, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`Simulated with Blast Radius · requests flow ${opts.format === 'vertical' ? 'top to bottom' : 'left to right'}`, tx, 122 * k, W - 128 * k);
  ctx.globalAlpha = 1;

  // ---------------------------------------------------------------- world
  ctx.setTransform(tf.scale, 0, 0, tf.scale, tf.ox, tf.oy);

  for (const wa of layout.annotations) {
    const p = progress(t, wa.appearAt, 0.5);
    if (p <= 0) continue;
    const { a } = wa;
    const color = a.color ?? (a.type === 'stage' ? '#3b82f6' : '#22d3ee');
    ctx.globalAlpha = p;
    if (a.type === 'stage') {
      const g = ctx.createLinearGradient(0, wa.y, 0, wa.y + wa.h);
      g.addColorStop(0, `${color}22`);
      g.addColorStop(0.45, `${color}0a`);
      g.addColorStop(1, `${color}00`);
      ctx.fillStyle = g;
      roundRect(ctx, wa.x, wa.y, wa.w, wa.h, 18);
      ctx.fill();
      ctx.font = '700 16px Inter, sans-serif';
      const label = a.text || 'Stage';
      const pw = Math.min(wa.w - 16, ctx.measureText(label).width + 36);
      const px = wa.x + (wa.w - pw) / 2;
      const py = wa.y + 4 + (1 - p) * -10;
      ctx.shadowColor = `${color}aa`;
      ctx.shadowBlur = 18;
      ctx.fillStyle = color;
      roundRect(ctx, px, py, pw, 34, 9);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px + pw / 2, py + 17, pw - 16);
    } else if (a.type === 'zone') {
      ctx.setLineDash([7, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `${color}99`;
      ctx.fillStyle = `${color}0d`;
      roundRect(ctx, wa.x, wa.y, wa.w, wa.h, 14);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '700 12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText((a.text || 'Zone').toUpperCase(), wa.x + 14, wa.y + 10);
    } else {
      const size = a.fontSize === 'lg' ? 20 : a.fontSize === 'sm' ? 12 : 15;
      ctx.fillStyle = a.color ?? TEXT;
      ctx.font = `${a.fontSize === 'lg' ? 700 : 500} ${size}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      wrap(ctx, a.text, wa.w - 8, 6).forEach((line, i) => ctx.fillText(line, wa.x + 4, wa.y + 4 + i * size * 1.3));
    }
  }
  ctx.globalAlpha = 1;

  // ---------------------------------------------------------------- links
  for (const e of layout.edges) {
    const s = scene.samples.get(e.id);
    if (!s) continue;
    const p = progress(t, e.revealAt, TIMING.EDGE_DRAW);
    if (p <= 0) continue;
    const color = e.traffic ? 'rgba(203,213,225,0.85)' : 'rgba(100,116,139,0.85)';
    ctx.lineWidth = e.traffic ? 2.2 : 1.6;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(e.traffic ? [7, 7] : [3, 6]);
    ctx.lineDashOffset = -(t - e.revealAt) * (e.traffic ? 34 : 12);
    if (p < 1) {
      const n = Math.max(2, Math.floor(p * (s.pts.length - 1)) + 1);
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
      ctx.stroke();
    } else {
      ctx.stroke(new Path2D(e.d));
    }
    ctx.setLineDash([]);
    if (p > 0.97) {
      const arrows = e.edge.arrows ?? 'end';
      const last = s.pts.length - 1;
      if (arrows === 'end' || arrows === 'both') arrowHead(ctx, s.pts[last], s.pts[Math.max(0, last - 2)], 10, color);
      if (arrows === 'start' || arrows === 'both') arrowHead(ctx, s.pts[0], s.pts[Math.min(last, 2)], 10, color);
    }
    const at = scene.labelAt.get(e.id);
    if (p >= 1 && at) {
      ctx.font = LABEL_FONT;
      const text = e.edge.label ?? '';
      const w = ctx.measureText(text).width + 14;
      ctx.globalAlpha = progress(t, e.revealAt + TIMING.EDGE_DRAW, 0.3);
      ctx.fillStyle = 'rgba(13,17,26,0.95)';
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 1;
      roundRect(ctx, at.x - w / 2, at.y - LABEL_H / 2, w, LABEL_H, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dbe2ee';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, at.x, at.y + 0.5);
      ctx.globalAlpha = 1;
    }
    // Particles: requests in flight.
    const count = opts.particles ? (scene.particleCount.get(e.id) ?? (e.traffic ? 2 : 0)) : 0;
    if (p >= 1 && count) {
      const speed = 150; // world units per second
      for (let i = 0; i < count; i++) {
        const u = (((t - e.revealAt) * speed) / s.len + i / count) % 1;
        const q = pointAt(s, u);
        ctx.fillStyle = 'rgba(34,211,238,0.22)';
        ctx.beginPath();
        ctx.arc(q.x, q.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = CYAN;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------------- components
  for (const n of layout.nodes) {
    const p = progress(t, n.appearAt, TIMING.NODE_POP);
    if (p <= 0) continue;
    const back = 1 + 1.7 * (p - 1) ** 3 + 0.7 * (p - 1) ** 2; // ease-out-back: a little overshoot
    const sc = 0.55 + 0.45 * back;
    const { x, y } = n.center;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.4);
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    const icon = scene.icons.get(n.id);
    if (!icon || icon.tile) {
      const c = icon?.color ?? CYAN;
      ctx.shadowColor = `${c}55`;
      ctx.shadowBlur = 22;
      ctx.fillStyle = '#121826';
      roundRect(ctx, -ICON / 2, -ICON / 2, ICON, ICON, 14);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `${c}88`;
      ctx.stroke();
      if (icon) ctx.drawImage(icon.img, -ICON * 0.3, -ICON * 0.3, ICON * 0.6, ICON * 0.6);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 16;
      ctx.drawImage(icon.img, -ICON / 2, -ICON / 2, ICON, ICON);
      ctx.shadowBlur = 0;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // A background-coloured halo keeps links that pass under a caption from striking through it.
    ctx.lineJoin = 'round';
    ctx.strokeStyle = BG;
    const caption = (text: string, x: number, y: number, max?: number) => {
      ctx.lineWidth = 5;
      ctx.strokeText(text, x, y, max);
      ctx.fillText(text, x, y, max);
    };
    ctx.fillStyle = TEXT;
    ctx.font = '700 15px Inter, sans-serif';
    caption(n.label, 0, ICON / 2 + 8, 200);
    if (n.sublabel && n.sublabel !== n.label) {
      ctx.fillStyle = MUTED;
      ctx.font = '500 11px Inter, sans-serif';
      wrap(ctx, n.sublabel, 180, 2).forEach((line, i) => caption(line, 0, ICON / 2 + 28 + i * 13));
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- footer
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = titleIn;
  const fy = H - 46 * k;
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${20 * k}px Inter, sans-serif`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  const urlW = ctx.measureText(URL).width;
  ctx.fillText(URL, W - 56 * k, fy);
  logo(ctx, W - 56 * k - urlW - 22 * k, fy, 14 * k);
  if (!centred) {
    ctx.textAlign = 'left';
    ctx.font = `500 ${17 * k}px Inter, sans-serif`;
    ctx.setLineDash([7 * k, 7 * k]);
    ctx.lineWidth = 2.2 * k;
    ctx.strokeStyle = 'rgba(203,213,225,0.85)';
    ctx.beginPath();
    ctx.moveTo(56 * k, fy);
    ctx.lineTo(96 * k, fy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(76 * k, fy, 3.5 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.fillText('traffic', 106 * k, fy);
    ctx.strokeStyle = 'rgba(100,116,139,0.85)';
    ctx.lineWidth = 1.6 * k;
    ctx.setLineDash([3 * k, 6 * k]);
    ctx.beginPath();
    ctx.moveTo(190 * k, fy);
    ctx.lineTo(230 * k, fy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText('drawing only', 240 * k, fy);
  }
  ctx.globalAlpha = 1;

  // ---------------------------------------------------------------- end card
  if (opts.endCard) {
    const e = progress(t, opts.duration - 2, 0.6);
    if (e > 0) {
      ctx.fillStyle = `rgba(7,9,15,${0.86 * e})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = e;
      logo(ctx, W / 2, H / 2 - 110 * k, 40 * k);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = TEXT;
      ctx.font = `800 ${58 * k}px Inter, sans-serif`;
      ctx.fillText('Design it. Break it. Prove it.', W / 2, H / 2, W - 120 * k);
      ctx.fillStyle = CYAN;
      ctx.font = `600 ${32 * k}px "JetBrains Mono", monospace`;
      ctx.fillText(URL, W / 2, H / 2 + 74 * k, W - 120 * k);
      ctx.globalAlpha = 1;
    }
  }
}
