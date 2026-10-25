import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES, type ChaosAction } from '@/core';
import { createSimStore, LiveContext, useSim } from '@/stores/simStore';
import { FlowCanvas } from '@/components/editor/FlowCanvas';
import { LiveStrip } from '@/components/sim/LiveStrip';

const design = TEMPLATES.find((t) => t.id === 'event-driven')!.design;
const providerEdge = design.edges.find((e) => design.nodes.find((n) => n.id === e.target)?.kind === 'external_api')!.id;
const dbId = design.nodes.find((n) => n.kind === 'database')!.id;
const cacheId = design.nodes.find((n) => n.kind === 'cache')!.id;

const SCRIPT: { caption: string; tone: 'warn' | 'bad'; act: ChaosAction; undo: ChaosAction }[] = [
  { caption: 'Payment provider +4000ms', tone: 'warn', act: { type: 'add_latency', edgeId: providerEdge, ms: 4000 }, undo: { type: 'heal', edgeId: providerEdge } },
  { caption: 'Database primary killed', tone: 'bad', act: { type: 'kill_instance', nodeId: dbId }, undo: { type: 'recover', nodeId: dbId } },
  { caption: 'Traffic spike: 5x', tone: 'warn', act: { type: 'traffic', multiplier: 5 }, undo: { type: 'traffic', multiplier: 1 } },
  { caption: 'Redis cluster down', tone: 'bad', act: { type: 'outage', nodeId: cacheId }, undo: { type: 'recover', nodeId: cacheId } },
];

/** Non-interactive hero: runs the event-driven template and breaks it every 8s. */
export function LiveDemo() {
  const store = useMemo(() => createSimStore(), []);
  const metrics = useSim(store, (s) => s.tick?.metrics);
  const [caption, setCaption] = useState<{ text: string; tone: 'warn' | 'bad' } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    const s = store.getState();
    s.play(design, { seed: 7 });
    let i = 0;
    let undoTimer: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      if (!visible.current || document.hidden) return;
      const step = SCRIPT[i++ % SCRIPT.length];
      store.getState().apply(step.act);
      setCaption({ text: step.caption, tone: step.tone });
      undoTimer = setTimeout(() => {
        store.getState().apply(step.undo);
        setCaption(null);
      }, 5000);
    }, 8000);

    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      const st = store.getState();
      if (entry.isIntersecting) st.resume();
      else st.pause();
    });
    if (ref.current) io.observe(ref.current);
    return () => {
      clearInterval(interval);
      clearTimeout(undoTimer);
      io.disconnect();
      store.getState().reset();
    };
  }, [store]);

  return (
    <div ref={ref} className="relative">
      <div className="panel relative h-[300px] overflow-hidden sm:h-[460px]">
        <LiveContext.Provider value={store}>
          <FlowCanvas design={design} interactive={false} fitKey="demo" />
        </LiveContext.Provider>
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-line bg-bg/80 px-2.5 py-1 text-[11px] text-muted backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
          </span>
          Live simulation
        </div>
        {caption && (
          <div
            className={`br-toast pointer-events-none absolute right-3 top-3 rounded-full border bg-bg/85 px-3 py-1 text-xs font-semibold backdrop-blur ${caption.tone === 'bad' ? 'border-bad/60 text-bad' : 'border-warn/60 text-warn'}`}
          >
            {caption.text}
          </div>
        )}
      </div>
      <div className="mt-3 flex justify-center">
        <LiveStrip metrics={metrics} compact />
      </div>
    </div>
  );
}
