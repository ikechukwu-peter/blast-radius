import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  BookmarkPlus,
  Pencil,
  Copy,
  Minus,
  Repeat,
  Spline,
  Type,
  ChevronDown,
  ChevronUp,
  HeartPulse,
  Keyboard,
  Link2,
  Pause,
  PanelRight,
  Play,
  Plus,
  PowerOff,
  Scissors,
  Skull,
  Snail,
  Square,
  TrendingDown,
  Turtle,
  X,
} from 'lucide-react';
import { reviewDesign, validateDesign, type Finding, type NodeKind, type SimEvent } from '@/core';
import { fmtClock } from '@/lib/format';
import { useDesign } from '@/stores/designStore';
import { editorSim, LiveContext, useSim } from '@/stores/simStore';
import { toast } from '@/stores/toastStore';
import { ContextMenu, type MenuItem } from '@/components/ui/ContextMenu';
import { Modal } from '@/components/ui/Modal';
import { ActiveChaosList } from '@/components/sim/ActiveChaos';
import { ChaosMenu } from '@/components/sim/ChaosMenu';
import { LiveStrip } from '@/components/sim/LiveStrip';
import { Telemetry } from '@/components/sim/Telemetry';
import { CostPanel } from './CostPanel';
import { ComponentEditor } from './ComponentEditor';
import { FlowCanvas, type SelectionChange } from './FlowCanvas';
import { findComponent, type CustomComponent } from '@/stores/libraryStore';
import { cloudService } from '@/lib/cloudCatalog';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';
import { AnalystPanel } from '@/ai/AnalystPanel';
import { buildAnalysisContext } from '@/ai/context';

const EDITOR_SUGGESTIONS = [
  'What is the biggest risk in this design?',
  'Why is latency or error rate high right now?',
  'What happens if the database primary dies?',
  'How can I cut cost without losing reliability?',
];
import { GradeBadge, ReviewPanel } from './ReviewPanel';

type Tab = 'properties' | 'review' | 'cost' | 'analyst';
type Menu = { kind: 'node' | 'edge'; id: string; x: number; y: number } | null;

const TOUR_KEY = 'br:tour-done';
const TOUR = [
  { title: 'Add components', body: 'Drag components from the left palette onto the canvas, or click one to add it.' },
  { title: 'Connect them', body: 'Drag from the right handle of one component to the left handle of another. Traffic flows left to right.' },
  { title: 'Press Play', body: 'Watch requests flow as particles. Live p99 and error rate appear at the bottom.' },
  { title: 'Break it', body: 'Right-click any component or connection while it runs, or open the Chaos menu. Then check the Review tab.' },
];

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['⌘/Ctrl C · V', 'Copy and paste the selection'],
  ['⌘/Ctrl D', 'Duplicate the selection'],
  ['⌘/Ctrl A', 'Select everything'],
  ['Shift drag', 'Box-select; Shift/⌘-click adds to the selection'],
  ['Double-click a link', 'Edit its label'],
  ['Drag a link end', 'Reconnect it to another component'],
  ['Drag a link’s +', 'Add a bend; double-click a bend to remove it'],
  ['Esc', 'Stop and reset the simulation'],
  ['K', 'Kill an instance of the selected component'],
  ['O', 'Full outage of the selected component'],
  ['D', 'Degrade the selected component'],
  ['R', 'Recover the selected component'],
  ['Delete', 'Delete selection (when stopped)'],
  ['⌘/Ctrl Z', 'Undo'],
  ['⇧ ⌘/Ctrl Z', 'Redo'],
  ['⌘/Ctrl S', 'Save'],
  ['?', 'This sheet'],
];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

export interface WorkspaceProps {
  readOnly?: boolean;
  headerLeft: ReactNode;
  headerRight?: ReactNode;
  onSave?: () => void;
  fitKey?: string | number;
}

export function Workspace({ readOnly = false, headerLeft, headerRight, onSave, fitKey }: WorkspaceProps) {
  const design = useDesign((s) => s.design);
  const structureVersion = useDesign((s) => s.structureVersion);
  const selectedNodeId = useDesign((s) => s.selectedNodeId);
  const selectedNodeIds = useDesign((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDesign((s) => s.selectedEdgeIds);
  const selection = useMemo(() => ({ nodes: selectedNodeIds, edges: selectedEdgeIds }), [selectedNodeIds, selectedEdgeIds]);
  const [componentDraft, setComponentDraft] = useState<Partial<CustomComponent> | null>(null);
  const review = useDesign((s) => s.review);
  const flash = useDesign((s) => s.flash);
  const status = useSim(editorSim, (s) => s.status);
  const speed = useSim(editorSim, (s) => s.speed);
  const elapsed = useSim(editorSim, (s) => s.elapsed);
  const metrics = useSim(editorSim, (s) => s.tick?.metrics);
  const history = useSim(editorSim, (s) => s.history);
  const events = useSim(editorSim, (s) => s.events);
  const multiplier = useSim(editorSim, (s) => s.trafficMultiplier);
  const activeChaosCount = useSim(editorSim, (s) => s.activeChaos.length);

  const [tab, setTab] = useState<Tab>('properties');
  const [panelOpen, setPanelOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(() => {
    try {
      return readOnly || localStorage.getItem(TOUR_KEY) ? null : 0;
    } catch {
      return null;
    }
  });

  const running = status === 'running' || status === 'paused';
  /** Phones and tablets have no right-click, so taps stand in for the context menu. */
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, []);
  const editable = !readOnly && !running;
  const store = useDesign.getState;

  const issues = useMemo(() => validateDesign(design), [design]);
  const invalidIds = useMemo(() => new Set(issues.flatMap((i) => [...i.nodeIds, ...i.edgeIds])), [issues]);
  const findingByNode = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of review?.findings ?? []) {
      if (f.severity === 'critical' || f.severity === 'high') for (const id of f.nodeIds) m[id] ??= f.title;
    }
    return m;
  }, [review]);

  // Any structural change resets a running simulation.
  useEffect(() => {
    const s = editorSim.getState();
    if (s.status !== 'stopped') {
      s.reset();
      toast('Design changed. Simulation reset.', 'info', 2200);
    }
  }, [structureVersion]);

  // Stop the sim when leaving the editor.
  useEffect(() => () => editorSim.getState().reset(), []);

  // Debounced deterministic review.
  useEffect(() => {
    if (running) return;
    const t = setTimeout(() => {
      try {
        store().setReview(reviewDesign(store().design));
      } catch (err) {
        console.error(err);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [structureVersion, running, store]);

  const togglePlay = useCallback(() => {
    const s = editorSim.getState();
    if (s.status === 'running') return s.pause();
    if (s.status === 'paused') return s.resume();
    const problems = validateDesign(store().design);
    if (problems.length) return toast(problems[0].message, 'error');
    s.play(store().design);
    setTourStep((t) => (t === 2 ? 3 : t));
  }, [store]);

  const nodeAction = useCallback(
    (type: 'kill_instance' | 'outage' | 'degrade' | 'recover', nodeId: string) => {
      const s = editorSim.getState();
      if (s.status === 'stopped' || s.status === 'finished') return toast('Press Play first, then break things.', 'info');
      s.apply({ type, nodeId });
    },
    [],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape' && editorSim.getState().status !== 'stopped') {
        editorSim.getState().reset();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (mod && e.key.toLowerCase() === 'z' && !readOnly) {
        e.preventDefault();
        if (e.shiftKey) store().redo();
        else store().undo();
      } else if (mod && !readOnly && ['c', 'v', 'd', 'a'].includes(e.key.toLowerCase())) {
        const key = e.key.toLowerCase();
        if (key === 'a') {
          e.preventDefault();
          store().selectAll();
        } else if (editorSim.getState().status !== 'stopped' && key !== 'c') {
          toast('Stop the simulation to edit.', 'info');
        } else if (key === 'c') {
          const n = store().copySelection();
          if (n) toast(`Copied ${n} item${n > 1 ? 's' : ''}`, 'info', 1500);
        } else {
          e.preventDefault();
          if (key === 'v') store().paste();
          else store().duplicateSelection();
        }
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave?.();
      } else if (e.key === '?') {
        setShortcutsOpen(true);
      } else if (!mod && selectedNodeId) {
        const map: Record<string, 'kill_instance' | 'outage' | 'degrade' | 'recover'> = { k: 'kill_instance', o: 'outage', d: 'degrade', r: 'recover' };
        const action = map[e.key.toLowerCase()];
        if (action && editorSim.getState().status !== 'stopped') nodeAction(action, selectedNodeId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, nodeAction, onSave, readOnly, selectedNodeId, store]);

  /** Palette items: a NodeKind, `lib:<id>` (a library component), `note` or `zone`. */
  const addItem = (item: string, position?: { x: number; y: number }) => {
    if (!editable) return toast(readOnly ? 'Fork this design to edit it.' : 'Stop the simulation to edit.', 'info');
    if (item === 'note') store().addAnnotation('text', position ?? { x: 0, y: -80 });
    else if (item === 'zone') store().addAnnotation('zone', position);
    else if (item === 'stage') store().addAnnotation('stage', position);
    else if (item.startsWith('cloud:')) {
      const svc = cloudService(item.slice(6));
      if (svc) store().addFromCloud(svc, position);
    }
    else if (item.startsWith('lib:')) {
      const c = findComponent(item.slice(4));
      if (c) store().addFromLibrary(c, position);
    } else store().addNode(item as NodeKind, position);
    setPaletteOpen(false);
    setTourStep((t) => (t === 0 ? 1 : t));
  };

  const connect = (source: string, target: string, handles: { sourceHandle?: string | null; targetHandle?: string | null }) => {
    const result = store().connect(source, target, handles);
    if (!result) return;
    if (result.reason) toast(`${result.reason} It's dashed and the simulator ignores it.`, 'info', 4500);
    else setTourStep((x) => (x === 1 ? 2 : x));
  };

  const applySelection = (nodes: SelectionChange[], edges: SelectionChange[]) => {
    const s = store();
    const n = new Set(s.selectedNodeIds);
    const e = new Set(s.selectedEdgeIds);
    for (const c of nodes) {
      if (c.selected) n.add(c.id);
      else n.delete(c.id);
    }
    for (const c of edges) {
      if (c.selected) e.add(c.id);
      else e.delete(c.id);
    }
    s.setSelection([...n], [...e]);
  };

  const guardEdit = (fn: () => void) => () => {
    if (readOnly) return toast('Fork this design to edit it.', 'info');
    if (running) return toast('Stop the simulation to edit.', 'info');
    fn();
  };

  const onFinding = (f: Finding) => {
    const id = f.nodeIds[0] ?? null;
    store().select(id, id ? null : (f.edgeIds[0] ?? null));
    if (f.nodeIds.length) store().flashIds(f.nodeIds);
  };

  const onEvent = (e: SimEvent) => {
    if (e.nodeId) {
      store().select(e.nodeId);
      store().flashIds([e.nodeId]);
    } else if (e.edgeId) store().select(null, e.edgeId);
  };

  const menuItems: MenuItem[] = (() => {
    if (!menu) return [];
    const isComponent = menu.kind === 'node' && design.nodes.some((n) => n.id === menu.id);
    const edge = menu.kind === 'edge' ? design.edges.find((x) => x.id === menu.id) : undefined;
    const isTrafficEdge = !!edge && (edge.kind ?? 'traffic') === 'traffic';
    if (menu.kind === 'node' && (!running || !isComponent)) {
      const items: MenuItem[] = [
        { label: 'Duplicate', icon: <Copy size={14} />, hint: '⌘D', onSelect: guardEdit(() => { store().select(menu.id); store().duplicateSelection(); }) },
      ];
      if (isComponent) {
        const n = design.nodes.find((x) => x.id === menu.id)!;
        items.push({
          label: 'Save to library',
          icon: <BookmarkPlus size={14} />,
          onSelect: () =>
            setComponentDraft({ name: n.appearance?.typeLabel ?? n.label, kind: n.kind, icon: n.appearance?.icon ?? '', color: n.appearance?.color ?? '#22d3ee', config: n.config, blurb: '' }),
        });
      }
      items.push({ label: 'Delete', icon: <X size={14} />, hint: '⌫', tone: 'bad', onSelect: guardEdit(() => store().removeNodes([menu.id])) });
      return items;
    }
    if (menu.kind === 'node') {
      return [
        { label: 'Kill instance', icon: <Skull size={14} />, hint: 'K', tone: 'bad', onSelect: () => nodeAction('kill_instance', menu.id) },
        { label: 'Full outage', icon: <PowerOff size={14} />, hint: 'O', tone: 'bad', onSelect: () => nodeAction('outage', menu.id) },
        { label: 'Degrade', icon: <TrendingDown size={14} />, hint: 'D', tone: 'warn', onSelect: () => nodeAction('degrade', menu.id) },
        { label: 'Recover', icon: <HeartPulse size={14} />, hint: 'R', tone: 'good', onSelect: () => nodeAction('recover', menu.id) },
      ];
    }
    if (!running || !isTrafficEdge) {
      if (!edge) return [];
      const arrows = edge.arrows ?? 'end';
      const nextArrows = { end: 'both', both: 'start', start: 'none', none: 'end' } as const;
      return [
        { label: edge.label ? 'Edit label' : 'Add label', icon: <Type size={14} />, hint: 'dbl-click', onSelect: guardEdit(() => store().setEditingEdge(edge.id)) },
        { label: `Arrowheads: ${arrows} → ${nextArrows[arrows]}`, icon: <ArrowLeftRight size={14} />, onSelect: guardEdit(() => store().styleEdge(edge.id, { arrows: nextArrows[arrows] })) },
        {
          label: 'Reverse direction',
          icon: <Repeat size={14} />,
          onSelect: guardEdit(() => {
            const reason = store().reverseEdge(edge.id);
            if (reason) toast(`${reason} It's now drawing-only.`, 'info', 4000);
          }),
        },
        {
          label: isTrafficEdge ? 'Make drawing-only' : 'Make it carry traffic',
          icon: <Spline size={14} />,
          onSelect: guardEdit(() => {
            const reason = store().setEdgeKind(edge.id, isTrafficEdge ? 'annotation' : 'traffic');
            if (reason) toast(reason, 'warn', 4000);
          }),
        },
        ...(edge.points?.length ? [{ label: 'Straighten (remove bends)', icon: <Minus size={14} />, onSelect: guardEdit(() => store().styleEdge(edge.id, { points: undefined })) }] : []),
        { label: 'Delete link', icon: <X size={14} />, hint: '⌫', tone: 'bad' as const, onSelect: guardEdit(() => store().removeEdges([edge.id])) },
      ];
    }
    const apply = (a: Parameters<ReturnType<typeof editorSim.getState>['apply']>[0]) => editorSim.getState().apply(a);
    return [
      { label: '+500ms latency', icon: <Turtle size={14} />, tone: 'warn', onSelect: () => apply({ type: 'add_latency', edgeId: menu.id, ms: 500 }) },
      { label: '+2000ms latency', icon: <Snail size={14} />, tone: 'warn', onSelect: () => apply({ type: 'add_latency', edgeId: menu.id, ms: 2000 }) },
      { label: 'Partition', icon: <Scissors size={14} />, tone: 'bad', onSelect: () => apply({ type: 'partition', edgeId: menu.id }) },
      { label: 'Heal', icon: <Link2 size={14} />, tone: 'good', onSelect: () => apply({ type: 'heal', edgeId: menu.id }) },
    ];
  })();

  const menuTitle = menu
    ? menu.kind === 'node'
      ? (design.nodes.find((n) => n.id === menu.id)?.label ?? (design.annotations?.find((a) => a.id === menu.id)?.type === 'zone' ? 'Zone' : 'Note'))
      : (() => {
          const e = design.edges.find((x) => x.id === menu.id);
          const l = (id?: string) => design.nodes.find((n) => n.id === id)?.label ?? 'note';
          return e ? `${l(e.source)} → ${l(e.target)}` : undefined;
        })()
    : undefined;

  const finishTour = () => {
    setTourStep(null);
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const rightPanel = (
    <>
      <div className="flex border-b border-line">
        {(['properties', 'review', 'cost', 'analyst'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2.5 text-xs font-semibold capitalize transition-colors ${tab === t ? 'border-b-2 border-ok text-text' : 'text-muted hover:text-text'}`}
          >
            {t === 'analyst' ? 'AI' : t}
            {t === 'review' && review && review.findings.length > 0 && (
              <span className="ml-1.5 rounded bg-panel2 px-1 font-num text-[10px] text-muted">{review.findings.length}</span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'properties' && <PropertiesPanel readOnly={!editable} />}
        {tab === 'review' && <ReviewPanel review={review} onFindingClick={onFinding} onStart={togglePlay} />}
        {tab === 'cost' && <CostPanel design={design} />}
        {tab === 'analyst' && (
          <AnalystPanel
            scope="design, review, live telemetry and incident log"
            suggestions={EDITOR_SUGGESTIONS}
            getContext={() => {
              const d = store();
              const sim = editorSim.getState();
              return buildAnalysisContext({ design: d.design, review: d.review, tick: sim.tick, history: sim.history.slice(-60), events: sim.events, activeChaos: sim.activeChaos.map((c) => c.label) });
            }}
          />
        )}
      </div>
    </>
  );

  return (
    <LiveContext.Provider value={editorSim}>
      <div className="flex h-full flex-col">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">{headerLeft}</div>
          <div className="hidden sm:block">
          <GradeBadge
            review={review}
            onClick={() => {
              setTab('review');
              setPanelOpen(true);
            }}
          />
          </div>
          <button className="btn-icon hidden md:inline-flex" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard size={15} />
          </button>
          {headerRight}
          <button className="btn-icon lg:hidden" onClick={() => setPanelOpen((o) => !o)} aria-label="Toggle side panel">
            <PanelRight size={15} />
          </button>
        </header>


        <div className="relative flex min-h-0 flex-1">
          {/* Palette */}
          {!readOnly && (
            <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-line bg-panel p-3 md:block">
              <Palette onAdd={(k) => addItem(k)} onEditComponent={setComponentDraft} />
            </aside>
          )}

          {/* Canvas */}
          <main className="relative min-w-0 flex-1">
            <FlowCanvas
              design={design}
              editable={editable}
              selection={selection}
              invalidIds={invalidIds}
              findingByNode={findingByNode}
              flash={flash}
              fitKey={fitKey}
              onSelectionChanges={applySelection}
              onDragStart={() => store().snapshot()}
              onDragStop={(ids) => store().snapToStages(ids)}
              onMove={(p) => store().moveNodes(p)}
              onRemoveNodes={(ids) => store().removeNodes(ids)}
              onRemoveEdges={(ids) => store().removeEdges(ids)}
              onConnect={connect}
              onReconnect={(id, c) => {
                if (!c.source || !c.target) return;
                const r = store().reconnect(id, { source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle });
                if (r?.reason) toast(`${r.reason} It's now drawing-only.`, 'info', 4000);
              }}
              onEdgeDoubleClick={(id) => store().setEditingEdge(id)}
              onDropItem={(item, pos) => addItem(item, pos)}
              onNodeTap={(id, x, y) => {
                if (coarse && running && design.nodes.some((n) => n.id === id)) setMenu({ kind: 'node', id, x, y });
              }}
              onEdgeTap={(id, x, y) => {
                if (coarse && running) setMenu({ kind: 'edge', id, x, y });
              }}
              onNodeMenu={(id, x, y) => {
                store().select(id);
                setMenu({ kind: 'node', id, x, y });
              }}
              onEdgeMenu={(id, x, y) => {
                store().select(null, id);
                setMenu({ kind: 'edge', id, x, y });
              }}
            />

            {/* Overlays */}
            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-start gap-2">
              {issues.length > 0 && !running && (
                <div className="pointer-events-auto rounded-md border border-bad/40 bg-bad/10 px-3 py-1.5 text-xs text-bad backdrop-blur">
                  {issues.length} issue{issues.length > 1 ? 's' : ''}: {issues[0].message}
                </div>
              )}
              <div className="pointer-events-auto">
                <ActiveChaosList store={editorSim} />
              </div>
            </div>
            {status === 'paused' && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-warn/50 bg-bg/90 px-3 py-1 text-xs font-semibold text-warn backdrop-blur">
                PAUSED · Space to resume · Esc to stop
              </div>
            )}

            {design.nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="max-w-xs text-center text-sm text-muted">
                  <p className="font-display text-lg text-text">Empty canvas</p>
                  <p className="mt-1">Drag components from the palette. Start with Clients, then add what they talk to.</p>
                </div>
              </div>
            )}

            {/* Phones: one floating control, depending on what you can do right now. */}
            <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3 lg:hidden">
              {running ? (
                !activeChaosCount && <span className="rounded-full border border-line bg-bg/90 px-3 py-1.5 text-xs text-muted backdrop-blur md:hidden">
                  Tap a component or link to break it
                </span>
              ) : !readOnly && (selectedNodeIds.length || selectedEdgeIds.length) ? (
                <div className="flex gap-1.5 rounded-xl border border-line bg-panel/95 p-1.5 shadow-2xl backdrop-blur">
                  {(selectedNodeIds.length + selectedEdgeIds.length === 1) && (
                    <button className="btn-primary" onClick={() => { setTab('properties'); setPanelOpen(true); }}>
                      <Pencil size={14} /> Edit
                    </button>
                  )}
                  {selectedEdgeIds.length === 1 && !selectedNodeIds.length && (
                    <button className="btn" onClick={() => store().setEditingEdge(selectedEdgeIds[0])}>
                      <Type size={14} /> Label
                    </button>
                  )}
                  {selectedNodeIds.length > 0 && (
                    <button className="btn" onClick={() => store().duplicateSelection()} aria-label="Duplicate">
                      <Copy size={14} />
                    </button>
                  )}
                  <button className="btn text-bad" onClick={() => { store().removeNodes(selectedNodeIds); store().removeEdges(selectedEdgeIds); }} aria-label="Delete">
                    <X size={14} />
                  </button>
                </div>
              ) : !readOnly ? (
                <button className="btn-primary shadow-lg md:hidden" onClick={() => setPaletteOpen(true)}>
                  <Plus size={15} /> Add component
                </button>
              ) : null}
            </div>

            {tourStep !== null && (
              <div className="panel absolute bottom-4 left-4 z-20 hidden w-72 p-4 shadow-2xl md:block">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ok">
                  Step {tourStep + 1} of {TOUR.length}
                  <button onClick={finishTour} className="text-muted hover:text-text" aria-label="Dismiss tour">
                    <X size={13} />
                  </button>
                </div>
                <div className="mt-1.5 font-display text-base font-semibold">{TOUR[tourStep].title}</div>
                <p className="mt-1 text-sm text-muted">{TOUR[tourStep].body}</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button className="btn-ghost text-xs" onClick={finishTour}>
                    Skip
                  </button>
                  <button className="btn text-xs" onClick={() => (tourStep + 1 >= TOUR.length ? finishTour() : setTourStep(tourStep + 1))}>
                    {tourStep + 1 >= TOUR.length ? 'Done' : 'Next'}
                  </button>
                </div>
              </div>
            )}
          </main>

          {/* Right panel: inline on desktop, drawer below lg */}
          <aside className="hidden w-80 shrink-0 flex-col border-l border-line bg-panel lg:flex">{rightPanel}</aside>
          {panelOpen && (
            <div className="absolute inset-0 z-30 flex justify-end bg-black/40 lg:hidden" onClick={() => setPanelOpen(false)}>
              <aside className="flex h-full w-[min(88vw,340px)] flex-col border-l border-line bg-panel" onClick={(e) => e.stopPropagation()}>
                {rightPanel}
              </aside>
            </div>
          )}
          {paletteOpen && (
            <div className="absolute inset-0 z-30 flex items-end bg-black/40 md:hidden" onClick={() => setPaletteOpen(false)}>
              <div className="w-full rounded-t-xl border-t border-line bg-panel p-4" onClick={(e) => e.stopPropagation()}>
                <Palette compact onAdd={(k) => addItem(k)} onEditComponent={setComponentDraft} />
              </div>
            </div>
          )}
        </div>

        {/* Sim bar */}
        <footer className="shrink-0 border-t border-line bg-panel">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-2 sm:px-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button className={status === 'running' ? 'btn' : 'btn-primary'} onClick={togglePlay} aria-label={status === 'running' ? 'Pause' : 'Play'} title="Space">
                {status === 'running' ? <Pause size={14} /> : <Play size={14} />}
                {status === 'running' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'}
              </button>
              <button className="btn" onClick={() => editorSim.getState().reset()} disabled={status === 'stopped'} aria-label="Stop simulation" title="Stop and reset (Esc)">
                <Square size={12} fill="currentColor" /> <span className="hidden sm:inline">Stop</span>
              </button>
              <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="Speed">
                {[1, 2, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => editorSim.getState().setSpeed(s)}
                    className={`px-2 py-1.5 font-num text-xs ${speed === s ? 'bg-ok/15 text-ok' : 'text-muted hover:text-text'}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <span className="hidden font-num text-sm text-muted sm:inline" aria-label="Simulated time">
                t={fmtClock(elapsed)}
              </span>
              {multiplier !== 1 && <span className="chip hidden bg-warn/15 text-warn sm:inline-flex">Traffic {multiplier}x</span>}
              <ChaosMenu store={editorSim} />
            </div>
            <div className="flex w-full items-center justify-between gap-4 overflow-x-auto sm:w-auto sm:flex-1 sm:justify-end">
              <LiveStrip metrics={metrics} />
              <button className="btn-icon hidden shrink-0 md:inline-flex" onClick={() => setTelemetryOpen((o) => !o)} aria-label="Toggle telemetry">
                {telemetryOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>
          {telemetryOpen && (
            <div className="hidden h-[170px] border-t border-line md:block">
              <Telemetry history={history} events={events} onSelectEvent={onEvent} />
            </div>
          )}
        </footer>

        <ComponentEditor draft={componentDraft} onClose={() => setComponentDraft(null)} />
        {menu && <ContextMenu x={menu.x} y={menu.y} title={menuTitle} items={menuItems} onClose={() => setMenu(null)} />}

        <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
          <dl className="space-y-2 text-sm">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="text-muted">{d}</dt>
                <dd>
                  <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-num text-xs">{k}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </Modal>
      </div>
    </LiveContext.Provider>
  );
}
