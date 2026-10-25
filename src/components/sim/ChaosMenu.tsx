import { useEffect, useRef, useState } from 'react';
import { Flame, HeartPulse } from 'lucide-react';
import type { SimStore } from '@/stores/simStore';
import { useSim } from '@/stores/simStore';

const TRAFFIC = [0.5, 1, 2, 5, 10];

export function ChaosMenu({ store }: { store: SimStore }) {
  const [open, setOpen] = useState(false);
  const status = useSim(store, (s) => s.status);
  const multiplier = useSim(store, (s) => s.trafficMultiplier);
  const ref = useRef<HTMLDivElement>(null);
  const disabled = status === 'stopped' || status === 'finished';
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        className="btn border-bad/40 text-bad hover:bg-bad/10"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={disabled ? 'Press Play first' : 'Inject chaos'}
        aria-haspopup="menu"
      >
        <Flame size={14} /> Chaos
      </button>
      {isOpen && (
        <div className="panel absolute bottom-full left-0 z-40 mb-2 w-64 p-3 shadow-2xl">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Traffic</div>
          <div className="grid grid-cols-5 gap-1">
            {TRAFFIC.map((m) => (
              <button
                key={m}
                className={`rounded-md border px-1 py-1.5 font-num text-xs ${m === multiplier ? 'border-ok/60 bg-ok/15 text-ok' : 'border-line hover:border-muted/60'}`}
                onClick={() => store.getState().apply({ type: 'traffic', multiplier: m })}
              >
                {m}x
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Right-click a component or connection on the canvas to kill, degrade, partition or slow it down.</p>
          <button
            className="btn mt-3 w-full text-good"
            onClick={() => {
              store.getState().apply({ type: 'recover_all' });
              setOpen(false);
            }}
          >
            <HeartPulse size={14} /> Recover everything
          </button>
        </div>
      )}
    </div>
  );
}
