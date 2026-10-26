import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/core';
import { CLOUD_TEMPLATES } from '@/lib/cloudTemplates';
import { FORMATS, ICON, buildLayout, fitTransform, nodeBox, placeLabels, progress } from '@/export/layout';

const aws = CLOUD_TEMPLATES.find((t) => t.id === 'aws-data-platform')!.design;
const weekend = TEMPLATES[0].design;

describe('video layout', () => {
  it('reveals components in reading order, left to right', () => {
    const l = buildLayout(aws, { vertical: false, rightAngles: true });
    const xs = l.nodes.map((n) => n.center.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 40);
    const times = l.nodes.map((n) => n.appearAt);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('draws a link only once both ends have appeared', () => {
    const l = buildLayout(aws, { vertical: false, rightAngles: true });
    const at = new Map(l.nodes.map((n) => [n.id, n.appearAt]));
    for (const e of l.edges) expect(e.revealAt).toBeGreaterThan(Math.max(at.get(e.edge.source)!, at.get(e.edge.target)!));
    expect(l.builtAt).toBeGreaterThanOrEqual(Math.max(...l.edges.map((e) => e.revealAt)));
  });

  it('keeps drawing-only links apart from traffic', () => {
    const l = buildLayout(aws, { vertical: false, rightAngles: true });
    expect(l.edges.find((e) => e.edge.label === 'lifecycle')!.traffic).toBe(false);
    expect(l.edges.find((e) => e.edge.label === 'MQTT')!.traffic).toBe(true);
  });

  it('turns the flow top-to-bottom for vertical video', () => {
    const l = buildLayout(aws, { vertical: true, rightAngles: true });
    const y = (id: string) => l.nodes.find((n) => n.id === id)!.center.y;
    expect(y('devices')).toBeLessThan(y('s3'));
    expect(y('s3')).toBeLessThan(y('redshift'));
    expect(l.bounds.h).toBeGreaterThan(l.bounds.w);
  });

  it('bounds contain every component and stage', () => {
    const l = buildLayout(aws, { vertical: false, rightAngles: false });
    for (const n of l.nodes) {
      expect(n.center.x - ICON / 2).toBeGreaterThanOrEqual(l.bounds.x);
      expect(n.center.y + ICON / 2).toBeLessThanOrEqual(l.bounds.y + l.bounds.h);
    }
    for (const a of l.annotations) expect(a.x + a.w).toBeLessThanOrEqual(l.bounds.x + l.bounds.w);
  });

  it('fits the diagram inside the content area without upscaling small designs too far', () => {
    const frame = FORMATS.landscape;
    const chrome = { top: 150, bottom: 96, side: 64 };
    const l = buildLayout(aws, { vertical: false, rightAngles: true });
    const { scale, ox, oy } = fitTransform(l.bounds, frame, chrome);
    expect(ox + l.bounds.x * scale).toBeGreaterThanOrEqual(chrome.side - 0.01);
    expect(ox + (l.bounds.x + l.bounds.w) * scale).toBeLessThanOrEqual(frame.width - chrome.side + 0.01);
    expect(oy + l.bounds.y * scale).toBeGreaterThanOrEqual(chrome.top - 0.01);
    expect(oy + (l.bounds.y + l.bounds.h) * scale).toBeLessThanOrEqual(frame.height - chrome.bottom + 0.01);
    expect(fitTransform(buildLayout(weekend, { vertical: false, rightAngles: true }).bounds, frame, chrome).scale).toBeLessThanOrEqual(2.2);
  });

  it('eases progress from 0 to 1', () => {
    expect(progress(0, 1, 1)).toBe(0);
    expect(progress(5, 1, 1)).toBe(1);
    expect(progress(1.5, 1, 1)).toBeGreaterThan(0.5);
  });
});

describe('link labels', () => {
  const l = buildLayout(weekend, { vertical: false, rightAngles: true });
  const n = l.nodes[0];

  it('slides a label off a component caption', () => {
    const onCaption = { x: n.center.x, y: n.center.y + ICON / 2 + 10 };
    const clear = { x: n.center.x, y: n.center.y + 400 };
    expect(placeLabels(l.nodes, [{ id: 'e', width: 60, candidates: [onCaption, clear] }]).get('e')).toEqual(clear);
  });

  it('keeps labels from stacking on each other', () => {
    const p = { x: 5000, y: 5000 };
    const q = { x: 5000, y: 5200 };
    const out = placeLabels(l.nodes, [
      { id: 'a', width: 60, candidates: [p, q] },
      { id: 'b', width: 60, candidates: [p, q] },
    ]);
    expect(out.get('a')).toEqual(p);
    expect(out.get('b')).toEqual(q);
  });

  it('falls back to the middle when nowhere is clear', () => {
    const box = nodeBox(n);
    const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
    expect(placeLabels(l.nodes, [{ id: 'e', width: 20, candidates: [mid] }]).get('e')).toEqual(mid);
  });
});
