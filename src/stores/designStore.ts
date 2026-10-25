import { create } from 'zustand';
import { KIND_LABELS, type Design, type DesignEdge, type DesignNode, type NodeConfig, type NodeKind, type Review } from '@/core';
import { uid } from '@/lib/format';

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

interface DesignState {
  design: Design;
  title: string;
  source: DesignSource;
  savedId: string | null;
  shareSlug: string | null;
  isPublic: boolean;
  ownerId: string | null;
  authorName: string | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /** Bumps on any change the simulation cares about (not node positions). */
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
  addNode(kind: NodeKind, position?: { x: number; y: number }): string;
  updateNode(id: string, patch: Partial<Pick<DesignNode, 'label'>>): void;
  updateNodeConfig(id: string, patch: Partial<NodeConfig>): void;
  removeNodes(ids: string[]): void;
  connect(source: string, target: string): boolean;
  updateEdge(id: string, patch: Partial<Pick<DesignEdge, 'weight' | 'latencyMs'>>): void;
  removeEdges(ids: string[]): void;
  /** Call once at drag start so the whole drag is one undo step. */
  snapshot(): void;
  moveNodes(positions: Record<string, { x: number; y: number }>): void;
  select(nodeId: string | null, edgeId?: string | null): void;
  undo(): void;
  redo(): void;
  setReview(review: Review | null): void;
  flashIds(ids: string[]): void;
}

export const DRAFT_KEY = 'br:draft';
const EMPTY: Design = { version: 1, nodes: [], edges: [] };

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

export const useDesign = create<DesignState>((set, get) => {
  const commit = (next: Design) => {
    const { design, past, structureVersion, saveVersion } = get();
    set({
      design: next,
      past: [...past, design].slice(-50),
      future: [],
      structureVersion: structureVersion + 1,
      saveVersion: saveVersion + 1,
    });
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
    selectedNodeId: null,
    selectedEdgeId: null,
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
        selectedNodeId: null,
        selectedEdgeId: null,
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

    addNode(kind, position) {
      const { design } = get();
      const id = uid(`${kind.replace('_', '')}-`);
      const count = design.nodes.filter((n) => n.kind === kind).length;
      const label = count ? `${KIND_LABELS[kind]} ${count + 1}` : KIND_LABELS[kind];
      const pos =
        position ??
        (design.nodes.length
          ? { x: Math.max(...design.nodes.map((n) => n.position?.x ?? 0)) + 240, y: design.nodes[design.nodes.length - 1].position?.y ?? 120 }
          : { x: 0, y: 120 });
      commit({ ...design, nodes: [...design.nodes, { id, kind, label, position: pos }] });
      set({ selectedNodeId: id, selectedEdgeId: null });
      return id;
    },

    updateNode(id, patch) {
      const { design } = get();
      commit({ ...design, nodes: design.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
    },

    updateNodeConfig(id, patch) {
      const { design } = get();
      commit({
        ...design,
        nodes: design.nodes.map((n) => (n.id === id ? { ...n, config: { ...(n.config ?? {}), ...patch } } : n)),
      });
    },

    removeNodes(ids) {
      if (!ids.length) return;
      const { design, selectedNodeId } = get();
      const drop = new Set(ids);
      commit({
        ...design,
        nodes: design.nodes.filter((n) => !drop.has(n.id)),
        edges: design.edges.filter((e) => !drop.has(e.source) && !drop.has(e.target)),
      });
      if (selectedNodeId && drop.has(selectedNodeId)) set({ selectedNodeId: null });
    },

    connect(source, target) {
      const { design } = get();
      if (source === target) return false;
      if (design.edges.some((e) => e.source === source && e.target === target)) return false;
      const targetNode = design.nodes.find((n) => n.id === target);
      if (!targetNode || targetNode.kind === 'client') return false;
      const id = uid('e-');
      commit({ ...design, edges: [...design.edges, { id, source, target }] });
      return true;
    },

    updateEdge(id, patch) {
      const { design } = get();
      commit({ ...design, edges: design.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    },

    removeEdges(ids) {
      if (!ids.length) return;
      const { design, selectedEdgeId } = get();
      const drop = new Set(ids);
      commit({ ...design, edges: design.edges.filter((e) => !drop.has(e.id)) });
      if (selectedEdgeId && drop.has(selectedEdgeId)) set({ selectedEdgeId: null });
    },

    snapshot() {
      const { design, past } = get();
      set({ past: [...past, design].slice(-50), future: [] });
    },

    moveNodes(positions) {
      const { design, saveVersion } = get();
      set({
        design: { ...design, nodes: design.nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)) },
        saveVersion: saveVersion + 1,
      });
    },

    select(nodeId, edgeId = null) {
      set({ selectedNodeId: nodeId, selectedEdgeId: edgeId });
    },

    undo() {
      const { past, design, future, structureVersion, saveVersion } = get();
      if (!past.length) return;
      set({
        design: past[past.length - 1],
        past: past.slice(0, -1),
        future: [design, ...future].slice(0, 50),
        structureVersion: structureVersion + 1,
        saveVersion: saveVersion + 1,
      });
    },

    redo() {
      const { past, design, future, structureVersion, saveVersion } = get();
      if (!future.length) return;
      set({
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
