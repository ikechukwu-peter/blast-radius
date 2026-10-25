import { describe, expect, it } from 'vitest';
import { FLOW_SQUASH, makeViewTransform, prefersVertical } from '@/lib/viewTransform';

describe('phone view transform', () => {
  const vt = makeViewTransform(true);

  it('is a no-op on wide screens', () => {
    const flat = makeViewTransform(false);
    expect(flat.toView({ x: 240, y: 80 })).toEqual({ x: 240, y: 80 });
    expect(flat.handle('r')).toBe('r');
  });

  it('turns left-to-right into top-to-bottom, compressing the flow axis', () => {
    expect(vt.toView({ x: 240, y: 80 })).toEqual({ x: 80, y: 240 * FLOW_SQUASH });
  });

  it('round-trips positions and sizes exactly, so the saved layout never changes', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 1260, y: 320 }, { x: -40, y: 17.5 }]) {
      const back = vt.fromView(vt.toView(p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
    const s = vt.sizeToView(520, 260);
    const back = vt.sizeFromView(s.width, s.height);
    expect(back.width).toBeCloseTo(520);
    expect(back.height).toBeCloseTo(260);
  });

  it('maps link sides with the transpose and is its own inverse', () => {
    expect(vt.handle('r')).toBe('b');
    expect(vt.handle('l')).toBe('t');
    for (const side of ['t', 'r', 'b', 'l']) expect(vt.handle(vt.handle(side))).toBe(side);
    expect(vt.handle(undefined)).toBeUndefined();
  });

  it('goes vertical only on narrow portrait canvases', () => {
    expect(prefersVertical(390, 700)).toBe(true);
    expect(prefersVertical(390, 300)).toBe(false); // landscape strip
    expect(prefersVertical(1200, 1400)).toBe(false); // big screen
  });
});
