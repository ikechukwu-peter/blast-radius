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

  it('refuses self loops, duplicates and edges into clients', () => {
    const c = s().addNode('client');
    const api = s().addNode('api_server');
    expect(s().connect(api, api)).toBe(false);
    expect(s().connect(c, api)).toBe(true);
    expect(s().connect(c, api)).toBe(false);
    expect(s().connect(api, c)).toBe(false);
    expect(s().design.edges).toHaveLength(1);
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
