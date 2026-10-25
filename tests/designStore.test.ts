// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_KEY, readDraft, useDesign } from '@/stores/designStore';

const s = () => useDesign.getState();

beforeEach(() => {
  localStorage.clear();
  s().loadDesign({ version: 1, nodes: [], edges: [] }, { source: 'draft' });
});

describe('designStore', () => {
  it('adds nodes with unique labels and selects them', () => {
    const a = s().addNode('api_server');
    const b = s().addNode('api_server');
    expect(s().design.nodes.map((n) => n.label)).toEqual(['API Server', 'API Server 2']);
    expect(s().selectedNodeId).toBe(b);
    expect(a).not.toBe(b);
  });

  it('refuses self loops; keeps duplicates and links into clients as drawing-only', () => {
    const c = s().addNode('client');
    const api = s().addNode('api_server');
    expect(s().connect(api, api)).toBeNull();
    expect(s().connect(c, api)?.kind).toBe('traffic');
    expect(s().connect(c, api)?.kind).toBe('annotation');
    expect(s().connect(api, c)?.kind).toBe('annotation');
    expect(s().design.edges.filter((e) => (e.kind ?? 'traffic') === 'traffic')).toHaveLength(1);
  });

  it('removing a node removes its edges', () => {
    const c = s().addNode('client');
    const api = s().addNode('api_server');
    s().connect(c, api);
    s().removeNodes([api]);
    expect(s().design.edges).toEqual([]);
  });

  it('undo and redo walk the history; a drag is one step', () => {
    const api = s().addNode('api_server', { x: 0, y: 0 });
    s().updateNodeConfig(api, { replicas: 5 });
    s().snapshot();
    s().moveNodes({ [api]: { x: 10, y: 0 } });
    s().moveNodes({ [api]: { x: 20, y: 0 } });
    s().undo();
    expect(s().design.nodes[0].position).toEqual({ x: 0, y: 0 });
    s().undo();
    expect(s().design.nodes[0].config?.replicas).toBeUndefined();
    s().redo();
    expect(s().design.nodes[0].config?.replicas).toBe(5);
  });

  it('only structural edits bump structureVersion (moves do not reset the simulation)', () => {
    const api = s().addNode('api_server');
    const v = s().structureVersion;
    s().moveNodes({ [api]: { x: 99, y: 9 } });
    expect(s().structureVersion).toBe(v);
    s().updateNodeConfig(api, { replicas: 2 });
    expect(s().structureVersion).toBe(v + 1);
  });

  it('persists drafts (debounced) but never shared designs', () => {
    vi.useFakeTimers();
    s().addNode('client');
    vi.advanceTimersByTime(600);
    expect(readDraft()?.design.nodes).toHaveLength(1);

    s().loadDesign({ version: 1, nodes: [{ id: 'x', kind: 'cache', label: 'Theirs' }], edges: [] }, { source: 'shared' });
    s().addNode('database');
    vi.advanceTimersByTime(600);
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).design.nodes).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('drawing in the store', () => {
  const setup = () => {
    const c = s().addNode('client');
    const api = s().addNode('api_server');
    const db = s().addNode('database');
    return { c, api, db };
  };

  it('a link that would break the simulation becomes drawing-only, with a reason', () => {
    const { c, api, db } = setup();
    expect(s().connect(c, api)?.kind).toBe('traffic');
    expect(s().connect(api, db)?.kind).toBe('traffic');
    const loop = s().connect(db, api)!;
    expect(loop.kind).toBe('annotation');
    expect(loop.reason).toMatch(/loop/);
    const dup = s().connect(api, db)!;
    expect(dup.kind).toBe('annotation');
    expect(s().design.edges).toHaveLength(4);
  });

  it('drawing-only changes do not reset the simulation', () => {
    const { c, api } = setup();
    const r = s().connect(c, api)!;
    const v = s().structureVersion;
    s().styleEdge(r.edgeId, { label: 'HTTPS', arrows: 'both', points: [{ x: 1, y: 2 }] });
    s().addAnnotation('zone');
    expect(s().structureVersion).toBe(v);
    expect(s().setEdgeKind(r.edgeId, 'annotation')).toBeNull();
    expect(s().structureVersion).toBe(v + 1);
  });

  it('cannot turn a looping link into traffic', () => {
    const { c, api, db } = setup();
    s().connect(c, api);
    s().connect(api, db);
    const loop = s().connect(db, api)!;
    expect(s().setEdgeKind(loop.edgeId, 'traffic')).toMatch(/loop/);
  });

  it('reconnecting keeps traffic when valid and downgrades when not', () => {
    const { c, api, db } = setup();
    const r = s().connect(c, api)!;
    expect(s().reconnect(r.edgeId, { source: c, target: db })?.kind).toBe('traffic');
    expect(s().reconnect(r.edgeId, { source: db, target: c })?.kind).toBe('annotation');
  });

  it('copy and paste duplicates components, shapes and the links between them with fresh ids', () => {
    const { c, api } = setup();
    s().connect(c, api);
    const note = s().addAnnotation('text');
    s().setSelection([c, api, note], []);
    expect(s().copySelection()).toBe(3);
    expect(s().paste()).toBe(3);
    const d = s().design;
    expect(d.nodes).toHaveLength(5);
    expect(d.annotations).toHaveLength(2);
    expect(d.edges).toHaveLength(2);
    const pasted = d.edges[1];
    expect([c, api]).not.toContain(pasted.source);
    expect(s().selectedNodeIds).toHaveLength(3);
    s().undo();
    expect(s().selectedNodeIds).toEqual([]);
  });

  it('library components keep their behaviour and look', () => {
    const id = s().addFromLibrary({ id: 'x', name: 'Kafka', blurb: '', kind: 'queue', icon: 'stream', color: '#a78bfa', config: { maxQueueDepth: 5 } });
    const n = s().design.nodes.find((x) => x.id === id)!;
    expect(n.kind).toBe('queue');
    expect(n.label).toBe('Kafka');
    expect(n.appearance).toEqual({ typeLabel: 'Kafka', icon: 'stream', color: '#a78bfa' });
    expect(n.config?.maxQueueDepth).toBe(5);
  });

  it('deleting a component removes links to it, including drawing-only ones', () => {
    const { c, api } = setup();
    s().connect(c, api);
    const note = s().addAnnotation('text');
    s().connect(api, note);
    s().removeNodes([api]);
    expect(s().design.edges).toEqual([]);
  });
});
