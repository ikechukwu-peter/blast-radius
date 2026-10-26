import { createContext, useContext } from 'react';

type Pt = { x: number; y: number };

/**
 * Designs are authored left-to-right. On a portrait phone that shrinks a diagram to an
 * unreadable strip, so the canvas can show it top-to-bottom instead: a transpose, with the
 * flow axis compressed so a five-component chain still fits one screen.
 *
 * This is a view, not an edit: everything the user does in it is mapped back before it is
 * stored, so the saved design (and the desktop layout) never changes.
 */
export const FLOW_SQUASH = 0.6;

export interface ViewTransform {
  vertical: boolean;
  toView(p: Pt): Pt;
  fromView(p: Pt): Pt;
  /** Box size in the view, for notes and zones. */
  sizeToView(w: number, h: number): { width: number; height: number };
  sizeFromView(w: number, h: number): { width: number; height: number };
  /** Transposing swaps sides: right <-> bottom, left <-> top. Self-inverse. */
  handle(id: string | null | undefined): string | undefined;
}

const SIDE: Record<string, string> = { r: 'b', b: 'r', l: 't', t: 'l' };

export function makeViewTransform(vertical: boolean, squash = FLOW_SQUASH): ViewTransform {
  if (!vertical) {
    return {
      vertical,
      toView: (p) => p,
      fromView: (p) => p,
      sizeToView: (width, height) => ({ width, height }),
      sizeFromView: (width, height) => ({ width, height }),
      handle: (id) => id ?? undefined,
    };
  }
  return {
    vertical,
    toView: (p) => ({ x: p.y, y: p.x * squash }),
    fromView: (p) => ({ x: p.y / squash, y: p.x }),
    sizeToView: (w, h) => ({ width: h, height: w * squash }),
    sizeFromView: (w, h) => ({ width: h / squash, height: w }),
    handle: (id) => (id ? (SIDE[id] ?? id) : undefined),
  };
}

export const ViewTransformContext = createContext<ViewTransform>(makeViewTransform(false));
export const useViewTransform = () => useContext(ViewTransformContext);

/** Portrait and narrow: show the diagram top-to-bottom. */
export function prefersVertical(width: number, height: number): boolean {
  return width < 700 && height > width * 1.05;
}
