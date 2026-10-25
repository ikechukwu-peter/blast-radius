import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeMarker,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { isSplitKind, type Design, type DesignEdge } from '@/core';
import { COLORS } from '@/lib/kinds';
import { useLive } from '@/stores/simStore';
import { TextNode, ZoneNode, type AnnotationFlowNode } from './AnnotationNodes';
import { SystemNode, type SystemFlowNode } from './SystemNode';
import { TrafficEdge, type TrafficFlowEdge } from './TrafficEdge';

const nodeTypes = { system: SystemNode, text: TextNode, zone: ZoneNode };
const edgeTypes = { traffic: TrafficEdge };

export const DRAG_MIME = 'application/x-blast-radius-kind';

type CanvasNode = SystemFlowNode | AnnotationFlowNode;
type Point = { x: number; y: number };

export interface SelectionChange {
  id: string;
  selected: boolean;
}

export interface FlowCanvasProps {
  design: Design;
  editable?: boolean;
  /** false = static showcase (no pan/zoom/select). */
  interactive?: boolean;
  selection?: { nodes: string[]; edges: string[] };
  invalidIds?: Set<string>;
  findingByNode?: Record<string, string>;
  flash?: { ids: string[]; at: number } | null;
  /** Changing this re-fits the view. */
  fitKey?: string | number;
  showMinimap?: boolean;
  showControls?: boolean;
  /** React Flow reports selection as incremental changes; apply them to the latest state. */
  onSelectionChanges?: (nodes: SelectionChange[], edges: SelectionChange[]) => void;
  onMove?: (positions: Record<string, Point>) => void;
  onDragStart?: () => void;
  onRemoveNodes?: (ids: string[]) => void;
  onRemoveEdges?: (ids: string[]) => void;
  onConnect?: (source: string, target: string, handles: { sourceHandle?: string | null; targetHandle?: string | null }) => void;
  onReconnect?: (edgeId: string, connection: Connection) => void;
  onEdgeDoubleClick?: (edgeId: string) => void;
  /** A palette item dropped on the canvas: a NodeKind, `lib:<id>`, `note` or `zone`. */
  onDropItem?: (item: string, position: Point) => void;
  onNodeMenu?: (nodeId: string, x: number, y: number) => void;
  onEdgeMenu?: (edgeId: string, x: number, y: number) => void;
}

function marker(color: string): EdgeMarker {
  return { type: MarkerType.ArrowClosed, width: 14, height: 14, color };
}

function Inner(props: FlowCanvasProps) {
  const { design, editable = false, interactive = true, selection, invalidIds, findingByNode, flash, fitKey, showMinimap = true, showControls = true } = props;
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
  const selectedNodes = useMemo(() => new Set(selection?.nodes ?? []), [selection]);
  const selectedEdges = useMemo(() => new Set(selection?.edges ?? []), [selection]);

  const nodes = useMemo<CanvasNode[]>(() => {
    const zones: AnnotationFlowNode[] = [];
    const texts: AnnotationFlowNode[] = [];
    for (const a of design.annotations ?? []) {
      const n: AnnotationFlowNode = {
        id: a.id,
        type: a.type,
        position: a.position,
        width: a.width,
        height: a.height,
        zIndex: a.type === 'zone' ? -1 : 0,
        selected: selectedNodes.has(a.id),
        draggable: editable,
        connectable: editable,
        data: { annotation: a, editable },
      };
      (a.type === 'zone' ? zones : texts).push(n);
    }
    const systems: SystemFlowNode[] = design.nodes.map((dn) => ({
      id: dn.id,
      type: 'system' as const,
      position: dn.position ?? { x: 0, y: 0 },
      measured: sizes[dn.id],
      selected: selectedNodes.has(dn.id),
      dragging: dn.id === dragging,
      draggable: editable,
      connectable: editable,
      data: {
        node: dn,
        invalid: invalidIds?.has(dn.id),
        finding: findingByNode?.[dn.id],
        flashAt: flash?.ids.includes(dn.id) ? flash.at : undefined,
      },
    }));
    // Zones first so they paint underneath everything else.
    return [...zones, ...texts, ...systems];
  }, [design, sizes, dragging, selectedNodes, invalidIds, findingByNode, flash, editable]);

  const edges = useMemo<TrafficFlowEdge[]>(() => {
    const kindOf = new Map(design.nodes.map((n) => [n.id, n.kind]));
    return design.edges.map((e: DesignEdge) => {
      const traffic = (e.kind ?? 'traffic') === 'traffic';
      const color = traffic ? '#3a4560' : '#56607a';
      const arrows = e.arrows ?? 'end';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? 'r',
        targetHandle: e.targetHandle ?? 'l',
        type: 'traffic' as const,
        selected: selectedEdges.has(e.id),
        reconnectable: editable,
        markerEnd: arrows === 'end' || arrows === 'both' ? marker(color) : undefined,
        markerStart: arrows === 'start' || arrows === 'both' ? marker(color) : undefined,
        data: {
          edge: e,
          split: isSplitKind(kindOf.get(e.source) ?? 'api_server'),
          targetId: e.target,
          invalid: invalidIds?.has(e.id),
          editable,
        },
      };
    });
  }, [design, selectedEdges, invalidIds, editable]);

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
    (changes: NodeChange<CanvasNode>[]) => {
      const measured = changes.filter((c) => c.type === 'dimensions' && c.dimensions && !c.resizing);
      if (measured.length) {
        setSizes((prev) => {
          const next = { ...prev };
          for (const c of measured) if (c.type === 'dimensions' && c.dimensions) next[c.id] = c.dimensions;
          return next;
        });
      }
      const sel = changes.flatMap((c) => (c.type === 'select' ? [{ id: c.id, selected: c.selected }] : []));
      if (sel.length) props.onSelectionChanges?.(sel, []);
      if (!editable) return;
      const moves: Record<string, Point> = {};
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
      const sel = changes.flatMap((c) => (c.type === 'select' ? [{ id: c.id, selected: c.selected }] : []));
      if (sel.length) props.onSelectionChanges?.([], sel);
      if (!editable) return;
      const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
      if (removed.length) props.onRemoveEdges?.(removed);
    },
    [editable, props],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      const item = e.dataTransfer.getData(DRAG_MIME);
      if (!item || !editable) return;
      e.preventDefault();
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      props.onDropItem?.(item, { x: Math.round((pos.x - 88) / 10) * 10, y: Math.round((pos.y - 30) / 10) * 10 });
    },
    [editable, props, rf],
  );

  return (
    <div ref={wrapper} className="h-full w-full">
      <ReactFlow<CanvasNode, TrafficFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        connectionMode={ConnectionMode.Loose}
        onConnect={(c) => c.source && c.target && props.onConnect?.(c.source, c.target, { sourceHandle: c.sourceHandle, targetHandle: c.targetHandle })}
        isValidConnection={(c) => c.source !== c.target}
        edgesReconnectable={editable}
        onReconnect={(old, c) => props.onReconnect?.(old.id, c)}
        onNodeDragStart={() => props.onDragStart?.()}
        onEdgeDoubleClick={(_, edge) => editable && props.onEdgeDoubleClick?.(edge.id)}
        onNodeContextMenu={(e, n: Node) => {
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
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionKeyCode="Shift"
        selectionMode={SelectionMode.Partial}
        snapToGrid={editable}
        snapGrid={[10, 10]}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable={interactive}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={false}
        preventScrolling={interactive}
        connectionLineStyle={{ stroke: COLORS.ok, strokeWidth: 1.5 }}
        connectionRadius={28}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1f2738" />
        {interactive && showControls && <Controls showInteractive={false} position="bottom-left" />}
        {interactive && showMinimap && (
          <MiniMap pannable zoomable position="bottom-right" nodeColor={() => '#1c2333'} nodeStrokeColor={() => '#2a3347'} className="!hidden md:!block" />
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
