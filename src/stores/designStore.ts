import { create } from 'zustand';
import {
  KIND_LABELS,
  trafficLinkProblem,
  type Annotation,
  type Design,
  type DesignEdge,
  type DesignNode,
  type NodeAppearance,
  type NodeConfig,
  type NodeKind,
  type Review,
} from '@/core';
import { uid } from '@/lib/format';
import type { CustomComponent } from '@/stores/libraryStore';
import type { CloudService } from '@/lib/cloudCatalog';

export type DesignSource = 'draft' | 'saved' | 'shared';

export interface DesignMeta {
  source: DesignSource;
  title?: string;
  savedId?: string | null;
  shareSlug?: string | null;
  isPublic?: boolean;
  ownerId?: string | null;
  authorName?: string | null;
}

type Point = { x: number; y: number };
/** UI-only edge fields: changing them never resets a running simulation. */
type EdgeLook = Pick<DesignEdge, 'label' | 'arrows' | 'pathStyle' | 'points' | 'dashed' | 'sourceHandle' | 'targetHandle'>;

export interface ConnectResult {
  edgeId: string;
  kind: 'traffic' | 'annotation';
  /** Why it was made drawing-only, if it was. */
  reason: string | null;
}

interface Clipboard {
  nodes: DesignNode[];
  annotations: Annotation[];
  edges: DesignEdge[];
}

interface DesignState {
  design: Design;
  title: string;
  source: DesignSource;
  savedId: string | null;
  shareSlug: string | null;
  isPublic: boolean;
  ownerId: string | null;
  authorName: string | null;
  /** Everything selected on the canvas (components and annotations share one id space). */
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  /** The single selected item, for the properties panel; null when 0 or several are selected. */
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  editingEdgeId: string | null;
  /** Bumps on any change the simulation cares about (not positions, labels or drawings). */
  structureVersion: number;
  /** Bumps on any change worth saving (including positions and title). */
  saveVersion: number;
  past: Design[];
  future: Design[];
  review: Review | null;
  flash: { ids: string[]; at: number } | null;

  loadDraft(): boolean;
  loadDesign(design: Design, meta: DesignMeta): void;
  setMeta(meta: Partial<DesignMeta>): void;
  setTitle(title: string): void;

  addNode(kind: NodeKind, position?: Point, extra?: { label?: string; appearance?: NodeAppearance; config?: Partial<NodeConfig> }): string;
  addFromLibrary(c: CustomComponent, position?: Point): string;
  addFromCloud(s: CloudService, position?: Point): string;
  /** Centre components that were dropped inside a stage column. */
  snapToStages(ids: string[]): void;
  updateNode(id: string, patch: Partial<Pick<DesignNode, 'label' | 'appearance'>>): void;
  updateNodeConfig(id: string, patch: Partial<NodeConfig>): void;

  addAnnotation(type: Annotation['type'], position?: Point): string;
  updateAnnotation(id: string, patch: Partial<Omit<Annotation, 'id' | 'type'>>, record?: boolean): void;

  /** Removes components and annotations (and their links). */
  removeNodes(ids: string[]): void;
  connect(source: string, target: string, handles?: { sourceHandle?: string | null; targetHandle?: string | null }): ConnectResult | null;
  reconnect(edgeId: string, to: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }): ConnectResult | null;
  updateEdge(id: string, patch: Partial<Pick<DesignEdge, 'weight' | 'latencyMs'>>): void;
  styleEdge(id: string, patch: Partial<EdgeLook>, record?: boolean): void;
  /** Switch a link between traffic and drawing-only. Returns the reason if traffic is impossible. */
  setEdgeKind(id: string, kind: 'traffic' | 'annotation'): string | null;
  reverseEdge(id: string): string | null;
  removeEdges(ids: string[]): void;

  /** Call once at drag start so the whole drag is one undo step. */
  snapshot(): void;
  moveNodes(positions: Record<string, Point>): void;

  select(nodeId: string | null, edgeId?: string | null): void;
  setSelection(nodeIds: string[], edgeIds: string[]): void;
  selectAll(): void;
  setEditingEdge(id: string | null): void;
  copySelection(): number;
  paste(): number;
  duplicateSelection(): number;

  undo(): void;
  redo(): void;
  setReview(review: Review | null): void;
  flashIds(ids: string[]): void;
}

export const DRAFT_KEY = 'br:draft';
const EMPTY: Design = { version: 1, nodes: [], edges: [] };
let clipboard: Clipboard | null = null;
let pasteCount = 0;

export function readDraft(): { title: string; design: Design } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.design?.version === 1 && Array.isArray(parsed.design.nodes)) return parsed;
  } catch {
    /* ignore corrupt drafts */
  }
  return null;
}

const single = (ids: string[], others: string[]) => (ids.length === 1 && others.length === 0 ? ids[0] : null);

function selectionState(nodeIds: string[], edgeIds: string[]) {
  return {
    selectedNodeIds: nodeIds,
    selectedEdgeIds: edgeIds,
    selectedNodeId: single(nodeIds, edgeIds),
    selectedEdgeId: single(edgeIds, nodeIds),
  };
}

const annotationsOf = (d: Design) => d.annotations ?? [];

const STAGE_NAMES = ['Ingestion', 'Data Lake', 'Computation', 'Data Warehouse', 'Presentation', 'Stage'];
const STAGE_COLORS = ['#10b981', '#3b82f6', '#f97316', '#a855f7', '#6366f1', '#06b6d4'];
/** Approximate card width, for centring a component in a stage column. */
const CARD_WIDTH = 176;

/** Keep only selected ids that still exist (after undo/redo removes or restores items). */
function prunedSelection(d: Design, nodeIds: string[], edgeIds: string[]) {
  const ids = new Set([...d.nodes.map((n) => n.id), ...annotationsOf(d).map((a) => a.id)]);
  const eids = new Set(d.edges.map((e) => e.id));
  return selectionState(nodeIds.filter((id) => ids.has(id)), edgeIds.filter((id) => eids.has(id)));
}

export const useDesign = create<DesignState>((set, get) => {
  /** Record an undoable change. `structural` = the simulation must restart. */
  const commit = (next: Design, structural = true) => {
    const { design, past, structureVersion, saveVersion } = get();
    set({
      design: next,
      past: [...past, design].slice(-80),
      future: [],
      structureVersion: structural ? structureVersion + 1 : structureVersion,
      saveVersion: saveVersion + 1,
    });
  };

  const nextPosition = (): Point => {
    const { design } = get();
    if (!design.nodes.length) return { x: 0, y: 120 };
    return {
      x: Math.max(...design.nodes.map((n) => n.position?.x ?? 0)) + 240,
      y: design.nodes[design.nodes.length - 1].position?.y ?? 120,
    };
  };

  const decideKind = (design: Design, source: string, target: string): { kind: ConnectResult['kind']; reason: string | null } => {
    const reason = trafficLinkProblem(design, source, target);
    return { kind: reason ? 'annotation' : 'traffic', reason };
  };

  return {
    design: EMPTY,
    title: 'Untitled design',
    source: 'draft',
    savedId: null,
    shareSlug: null,
    isPublic: false,
    ownerId: null,
    authorName: null,
    ...selectionState([], []),
    editingEdgeId: null,
    structureVersion: 0,
    saveVersion: 0,
    past: [],
    future: [],
    review: null,
    flash: null,

    loadDraft() {
      const draft = readDraft();
      get().loadDesign(draft?.design ?? EMPTY, { source: 'draft', title: draft?.title ?? 'Untitled design' });
      return !!draft && draft.design.nodes.length > 0;
    },

    loadDesign(design, meta) {
      set({
        design: structuredClone(design),
        title: meta.title ?? 'Untitled design',
        source: meta.source,
        savedId: meta.savedId ?? null,
        shareSlug: meta.shareSlug ?? null,
        isPublic: meta.isPublic ?? false,
        ownerId: meta.ownerId ?? null,
        authorName: meta.authorName ?? null,
        ...selectionState([], []),
        editingEdgeId: null,
        past: [],
        future: [],
        review: null,
        structureVersion: get().structureVersion + 1,
        saveVersion: 0,
      });
    },

    setMeta(meta) {
      const patch: Partial<DesignState> = {};
      if (meta.source !== undefined) patch.source = meta.source;
      if (meta.savedId !== undefined) patch.savedId = meta.savedId;
      if (meta.shareSlug !== undefined) patch.shareSlug = meta.shareSlug;
      if (meta.isPublic !== undefined) patch.isPublic = meta.isPublic;
      if (meta.ownerId !== undefined) patch.ownerId = meta.ownerId;
      if (meta.title !== undefined) patch.title = meta.title;
      set(patch);
    },

    setTitle(title) {
      set({ title, saveVersion: get().saveVersion + 1 });
    },

    // ------------------------------------------------------------ components

    addNode(kind, position, extra = {}) {
      const { design } = get();
      const id = uid(`${kind.replace('_', '')}-`);
      const base = extra.label ?? extra.appearance?.typeLabel ?? KIND_LABELS[kind];
      const count = design.nodes.filter((n) => n.label === base || n.label.startsWith(`${base} `)).length;
      const label = count ? `${base} ${count + 1}` : base;
      const node: DesignNode = { id, kind, label, position: position ?? nextPosition() };
      if (extra.appearance) node.appearance = extra.appearance;
      if (extra.config && Object.keys(extra.config).length) node.config = { ...extra.config };
      commit({ ...design, nodes: [...design.nodes, node] });
      set(selectionState([id], []));
      return id;
    },

    addFromLibrary(c, position) {
      return get().addNode(c.kind, position, {
        label: c.name,
        appearance: { typeLabel: c.name, icon: c.icon, color: c.color },
        config: c.config,
      });
    },

    addFromCloud(s, position) {
      return get().addNode(s.kind, position, {
        label: s.short,
        appearance: { typeLabel: s.name, icon: `cloud:${s.id}` },
        config: s.config,
      });
    },

    snapToStages(ids) {
      const { design, saveVersion } = get();
      const stages = annotationsOf(design).filter((a) => a.type === 'stage');
      if (!stages.length) return;
      const moved = new Set(ids);
      let changed = false;
      const nodes = design.nodes.map((n) => {
        if (!moved.has(n.id) || !n.position) return n;
        const cx = n.position.x + CARD_WIDTH / 2;
        const cy = n.position.y;
        const stage = stages.find((s) => cx >= s.position.x && cx <= s.position.x + s.width && cy >= s.position.y - 40 && cy <= s.position.y + s.height);
        // Only single-file columns snap; a wide stage can hold components side by side.
        if (!stage || stage.width > CARD_WIDTH * 2) return n;
        const x = Math.round(stage.position.x + (stage.width - CARD_WIDTH) / 2);
        if (x === n.position.x) return n;
        changed = true;
        return { ...n, position: { ...n.position, x } };
      });
      if (changed) set({ design: { ...design, nodes }, saveVersion: saveVersion + 1 });
    },

    updateNode(id, patch) {
      const { design } = get();
      const structural = 'label' in patch; // labels appear in the incident log
      commit({ ...design, nodes: design.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }, structural);
    },

    updateNodeConfig(id, patch) {
      const { design } = get();
      commit({
        ...design,
        nodes: design.nodes.map((n) => (n.id === id ? { ...n, config: { ...(n.config ?? {}), ...patch } } : n)),
      });
    },

    // ------------------------------------------------------------ annotations

    addAnnotation(type, position) {
      const { design } = get();
      const id = uid(type === 'text' ? 'note-' : type === 'zone' ? 'zone-' : 'stage-');
      const stages = annotationsOf(design).filter((a) => a.type === 'stage');
      const annotation: Annotation =
        type === 'text'
          ? { id, type, position: position ?? { x: 0, y: 0 }, width: 220, height: 60, text: 'Double-click to edit', fontSize: 'md' }
          : type === 'zone'
            ? { id, type, position: position ?? { x: -40, y: 40 }, width: 520, height: 260, text: 'Zone', color: '#22d3ee' }
            : {
                id,
                type,
                // New stages line up to the right of the last one.
                position: position ?? (stages.length ? { x: Math.max(...stages.map((s) => s.position.x + s.width)) + 20, y: stages[0].position.y } : { x: -40, y: -60 }),
                width: 260,
                height: 620,
                text: STAGE_NAMES[stages.length % STAGE_NAMES.length],
                color: STAGE_COLORS[stages.length % STAGE_COLORS.length],
              };
      commit({ ...design, annotations: [...annotationsOf(design), annotation] }, false);
      set(selectionState([id], []));
      return id;
    },

    updateAnnotation(id, patch, record = true) {
      const { design, saveVersion } = get();
      const next = { ...design, annotations: annotationsOf(design).map((a) => (a.id === id ? { ...a, ...patch } : a)) };
      if (record) commit(next, false);
      else set({ design: next, saveVersion: saveVersion + 1 });
    },

    removeNodes(ids) {
      if (!ids.length) return;
      const { design, selectedNodeIds, selectedEdgeIds } = get();
      const drop = new Set(ids);
      const nodes = design.nodes.filter((n) => !drop.has(n.id));
      const structural = nodes.length !== design.nodes.length;
      commit(
        {
          ...design,
          nodes,
          annotations: annotationsOf(design).filter((a) => !drop.has(a.id)),
          edges: design.edges.filter((e) => !drop.has(e.source) && !drop.has(e.target)),
        },
        structural,
      );
      set(selectionState(selectedNodeIds.filter((id) => !drop.has(id)), selectedEdgeIds));
    },

    // ------------------------------------------------------------ links

    connect(source, target, handles = {}) {
      const { design } = get();
      if (source === target) return null;
      const { kind, reason } = decideKind(design, source, target);
      const id = uid('e-');
      const edge: DesignEdge = { id, source, target };
      if (kind === 'annotation') edge.kind = 'annotation';
      if (handles.sourceHandle) edge.sourceHandle = handles.sourceHandle;
      if (handles.targetHandle) edge.targetHandle = handles.targetHandle;
      commit({ ...design, edges: [...design.edges, edge] }, kind === 'traffic');
      return { edgeId: id, kind, reason };
    },

    reconnect(edgeId, to) {
      const { design } = get();
      const old = design.edges.find((e) => e.id === edgeId);
      if (!old || to.source === to.target) return null;
      // Judge the new endpoints against the design without this link.
      const without = { ...design, edges: design.edges.filter((e) => e.id !== edgeId) };
      const wantsTraffic = (old.kind ?? 'traffic') === 'traffic';
      const reason = wantsTraffic ? trafficLinkProblem(without, to.source, to.target) : null;
      const kind: 'traffic' | 'annotation' = wantsTraffic && !reason ? 'traffic' : 'annotation';
      const next: DesignEdge = {
        ...old,
        source: to.source,
        target: to.target,
        sourceHandle: to.sourceHandle ?? undefined,
        targetHandle: to.targetHandle ?? undefined,
        kind: kind === 'annotation' ? 'annotation' : undefined,
        points: undefined,
      };
      commit({ ...design, edges: design.edges.map((e) => (e.id === edgeId ? next : e)) });
      return { edgeId, kind, reason };
    },

    updateEdge(id, patch) {
      const { design } = get();
      commit({ ...design, edges: design.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    },

    styleEdge(id, patch, record = true) {
      const { design, saveVersion } = get();
      const next = { ...design, edges: design.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
      if (record) commit(next, false);
      else set({ design: next, saveVersion: saveVersion + 1 });
    },

    setEdgeKind(id, kind) {
      const { design } = get();
      const edge = design.edges.find((e) => e.id === id);
      if (!edge) return null;
      if (kind === 'traffic') {
        const without = { ...design, edges: design.edges.filter((e) => e.id !== id) };
        const reason = trafficLinkProblem(without, edge.source, edge.target);
        if (reason) return reason;
      }
      commit({ ...design, edges: design.edges.map((e) => (e.id === id ? { ...e, kind: kind === 'annotation' ? 'annotation' : undefined } : e)) });
      return null;
    },

    reverseEdge(id) {
      const edge = get().design.edges.find((e) => e.id === id);
      if (!edge) return null;
      const result = get().reconnect(id, { source: edge.target, target: edge.source, sourceHandle: edge.targetHandle, targetHandle: edge.sourceHandle });
      return result?.reason ?? null;
    },

    removeEdges(ids) {
      if (!ids.length) return;
      const { design, selectedNodeIds, selectedEdgeIds } = get();
      const drop = new Set(ids);
      const structural = design.edges.some((e) => drop.has(e.id) && (e.kind ?? 'traffic') === 'traffic');
      commit({ ...design, edges: design.edges.filter((e) => !drop.has(e.id)) }, structural);
      set(selectionState(selectedNodeIds, selectedEdgeIds.filter((id) => !drop.has(id))));
    },

    // ------------------------------------------------------------ moving

    snapshot() {
      const { design, past } = get();
      set({ past: [...past, design].slice(-80), future: [] });
    },

    moveNodes(positions) {
      const { design, saveVersion } = get();
      set({
        design: {
          ...design,
          nodes: design.nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
          annotations: design.annotations?.map((a) => (positions[a.id] ? { ...a, position: positions[a.id] } : a)),
        },
        saveVersion: saveVersion + 1,
      });
    },

    // ------------------------------------------------------------ selection & clipboard

    select(nodeId, edgeId = null) {
      set(selectionState(nodeId ? [nodeId] : [], edgeId ? [edgeId] : []));
    },

    setSelection(nodeIds, edgeIds) {
      set(selectionState(nodeIds, edgeIds));
    },

    selectAll() {
      const { design } = get();
      set(selectionState([...design.nodes.map((n) => n.id), ...annotationsOf(design).map((a) => a.id)], design.edges.map((e) => e.id)));
    },

    setEditingEdge(id) {
      set({ editingEdgeId: id });
    },

    copySelection() {
      const { design, selectedNodeIds } = get();
      const ids = new Set(selectedNodeIds);
      const nodes = design.nodes.filter((n) => ids.has(n.id));
      const annotations = annotationsOf(design).filter((a) => ids.has(a.id));
      if (!nodes.length && !annotations.length) return 0;
      clipboard = structuredClone({ nodes, annotations, edges: design.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) });
      pasteCount = 0;
      return nodes.length + annotations.length;
    },

    paste() {
      if (!clipboard) return 0;
      pasteCount += 1;
      const offset = 32 * pasteCount;
      const { design } = get();
      const remap = new Map<string, string>();
      const shift = (p?: Point) => ({ x: (p?.x ?? 0) + offset, y: (p?.y ?? 0) + offset });
      const nodes = clipboard.nodes.map((n) => {
        const id = uid(`${n.kind.replace('_', '')}-`);
        remap.set(n.id, id);
        return { ...structuredClone(n), id, position: shift(n.position) };
      });
      const annotations = clipboard.annotations.map((a) => {
        const id = uid(a.type === 'text' ? 'note-' : 'zone-');
        remap.set(a.id, id);
        return { ...structuredClone(a), id, position: shift(a.position) };
      });
      const edges = clipboard.edges.map((e) => ({
        ...structuredClone(e),
        id: uid('e-'),
        source: remap.get(e.source)!,
        target: remap.get(e.target)!,
        points: e.points?.map(shift),
      }));
      commit({ ...design, nodes: [...design.nodes, ...nodes], annotations: [...annotationsOf(design), ...annotations], edges: [...design.edges, ...edges] }, nodes.length > 0);
      set(selectionState([...remap.values()], edges.map((e) => e.id)));
      return remap.size;
    },

    duplicateSelection() {
      return get().copySelection() ? get().paste() : 0;
    },

    // ------------------------------------------------------------ history

    undo() {
      const { past, design, future, structureVersion, saveVersion, selectedNodeIds, selectedEdgeIds } = get();
      if (!past.length) return;
      set({
        ...prunedSelection(past[past.length - 1], selectedNodeIds, selectedEdgeIds),
        editingEdgeId: null,
        design: past[past.length - 1],
        past: past.slice(0, -1),
        future: [design, ...future].slice(0, 80),
        structureVersion: structureVersion + 1,
        saveVersion: saveVersion + 1,
      });
    },

    redo() {
      const { past, design, future, structureVersion, saveVersion, selectedNodeIds, selectedEdgeIds } = get();
      if (!future.length) return;
      set({
        ...prunedSelection(future[0], selectedNodeIds, selectedEdgeIds),
        editingEdgeId: null,
        design: future[0],
        past: [...past, design],
        future: future.slice(1),
        structureVersion: structureVersion + 1,
        saveVersion: saveVersion + 1,
      });
    },

    setReview(review) {
      set({ review });
    },

    flashIds(ids) {
      set({ flash: { ids, at: performance.now() } });
    },
  };
});

// Persist the local draft (only for unsaved designs).
let draftTimer: ReturnType<typeof setTimeout> | undefined;
useDesign.subscribe((s, prev) => {
  if (s.source !== 'draft' || (s.design === prev.design && s.title === prev.title)) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: s.title, design: s.design }));
    } catch {
      /* storage full or blocked */
    }
  }, 500);
});
