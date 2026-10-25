import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { isSplitKind, type Design, type NodeKind } from '@/core';
import { COLORS } from '@/lib/kinds';
import { useLive } from '@/stores/simStore';
import { SystemNode, type SystemFlowNode } from './SystemNode';
import { TrafficEdge, type TrafficFlowEdge } from './TrafficEdge';

const nodeTypes = { system: SystemNode };
const edgeTypes = { traffic: TrafficEdge };

export const DRAG_MIME = 'application/x-blast-radius-kind';

export interface FlowCanvasProps {
  design: Design;
  editable?: boolean;
  /** false = static showcase (no pan/zoom/select). */
  interactive?: boolean;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  invalidIds?: Set<string>;
  findingByNode?: Record<string, string>;
  flash?: { ids: string[]; at: number } | null;
  /** Changing this re-fits the view. */
  fitKey?: string | number;
  showMinimap?: boolean;
  showControls?: boolean;
  onSelect?: (nodeId: string | null, edgeId: string | null) => void;
  onMove?: (positions: Record<string, { x: number; y: number }>) => void;
  onDragStart?: () => void;
  onRemoveNodes?: (ids: string[]) => void;
  onRemoveEdges?: (ids: string[]) => void;
  onConnect?: (source: string, target: string) => void;
  onDropKind?: (kind: NodeKind, position: { x: number; y: number }) => void;
  onNodeMenu?: (nodeId: string, x: number, y: number) => void;
  onEdgeMenu?: (edgeId: string, x: number, y: number) => void;
}

function Inner(props: FlowCanvasProps) {
  const {
    design,
    editable = false,
    interactive = true,
    selectedNodeId,
    selectedEdgeId,
    invalidIds,
    findingByNode,
    flash,
    fitKey,
    showMinimap = true,
    showControls = true,
  } = props;
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const paused = useLive((s) => s.status === 'paused' || s.status === 'finished');

  // Freeze the SVG particle animations while the simulation is paused, so the canvas
  // never looks like it is still running.
  useEffect(() => {
    wrapper.current?.querySelectorAll('svg').forEach((svg) => (paused ? svg.pauseAnimations() : svg.unpauseAnimations()));
  }, [paused, design]);

  // The design store is the single source of truth. React Flow only contributes the sizes
  // it measures, which are kept here so they survive re-derivation.
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  const nodes = useMemo<SystemFlowNode[]>(
    () =>
      design.nodes.map((dn) => ({
        id: dn.id,
        type: 'system' as const,
        position: dn.position ?? { x: 0, y: 0 },
        measured: sizes[dn.id],
        selected: dn.id === selectedNodeId,
        dragging: dn.id === dragging,
        draggable: editable,
        connectable: editable,
        data: {
          node: dn,
          invalid: invalidIds?.has(dn.id),
          finding: findingByNode?.[dn.id],
          flashAt: flash?.ids.includes(dn.id) ? flash.at : undefined,
        },
      })),
    [design, sizes, dragging, selectedNodeId, invalidIds, findingByNode, flash, editable],
  );

  const edges = useMemo<TrafficFlowEdge[]>(() => {
    const kindOf = new Map(design.nodes.map((n) => [n.id, n.kind]));
    return design.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'traffic' as const,
      selected: e.id === selectedEdgeId,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#3a4560' },
      data: { edge: e, split: isSplitKind(kindOf.get(e.source) ?? 'api_server'), targetId: e.target, invalid: invalidIds?.has(e.id) },
    }));
  }, [design, selectedEdgeId, invalidIds]);

  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: interactive ? 0.15 : 0.06, duration: 250, maxZoom: 1.1 }), 60);
    return () => clearTimeout(t);
  }, [fitKey, rf, interactive]);

  // Pan to flashed nodes (review findings, incident log clicks).
  useEffect(() => {
    if (!flash?.ids.length || !interactive) return;
    rf.fitView({ nodes: flash.ids.map((id) => ({ id })), padding: 0.6, duration: 400, maxZoom: 1.2 });
  }, [flash, rf, interactive]);

  const onNodesChange = useCallback(
    (changes: NodeChange<SystemFlowNode>[]) => {
      const measured = changes.filter((c) => c.type === 'dimensions' && c.dimensions);
      if (measured.length) {
        setSizes((prev) => {
          const next = { ...prev };
          for (const c of measured) if (c.type === 'dimensions' && c.dimensions) next[c.id] = c.dimensions;
          return next;
        });
      }
      if (!editable) return;
      const moves: Record<string, { x: number; y: number }> = {};
      const removed: string[] = [];
      for (const c of changes) {
        if (c.type === 'position') {
          if (c.position) moves[c.id] = c.position;
          setDragging(c.dragging ? c.id : null);
        }
        if (c.type === 'remove') removed.push(c.id);
      }
      if (Object.keys(moves).length) props.onMove?.(moves);
      if (removed.length) props.onRemoveNodes?.(removed);
    },
    [editable, props],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<TrafficFlowEdge>[]) => {
      if (!editable) return;
      const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
      if (removed.length) props.onRemoveEdges?.(removed);
    },
    [editable, props],
  );

  const isValidConnection = useCallback(
    (c: Connection | TrafficFlowEdge) => {
      if (c.source === c.target) return false;
      const target = design.nodes.find((n) => n.id === c.target);
      if (!target || target.kind === 'client') return false;
      return !design.edges.some((e) => e.source === c.source && e.target === c.target);
    },
    [design],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      const kind = e.dataTransfer.getData(DRAG_MIME) as NodeKind;
      if (!kind || !editable) return;
      e.preventDefault();
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      props.onDropKind?.(kind, { x: pos.x - 88, y: pos.y - 30 });
    },
    [editable, props, rf],
  );

  return (
    <div ref={wrapper} className="h-full w-full">
    <ReactFlow<SystemFlowNode, TrafficFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={(c) => c.source && c.target && props.onConnect?.(c.source, c.target)}
      isValidConnection={isValidConnection}
      onNodeDragStart={() => props.onDragStart?.()}
      onNodeClick={(_, n) => props.onSelect?.(n.id, null)}
      onEdgeClick={(_, e) => props.onSelect?.(null, e.id)}
      onPaneClick={() => props.onSelect?.(null, null)}
      onNodeContextMenu={(e, n) => {
        if (!props.onNodeMenu) return;
        e.preventDefault();
        props.onNodeMenu(n.id, e.clientX, e.clientY);
      }}
      onEdgeContextMenu={(e, edge) => {
        if (!props.onEdgeMenu) return;
        e.preventDefault();
        props.onEdgeMenu(edge.id, e.clientX, e.clientY);
      }}
      onDragOver={(e) => {
        if (!editable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={onDrop}
      deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable={interactive}
      panOnDrag={interactive}
      zoomOnScroll={interactive}
      zoomOnPinch={interactive}
      zoomOnDoubleClick={false}
      preventScrolling={interactive}
      connectionLineStyle={{ stroke: COLORS.ok, strokeWidth: 1.5 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1f2738" />
      {interactive && showControls && <Controls showInteractive={false} position="bottom-left" />}
      {interactive && showMinimap && (
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={() => '#1c2333'}
          nodeStrokeColor={() => '#2a3347'}
          className="!hidden md:!block"
        />
      )}
    </ReactFlow>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
