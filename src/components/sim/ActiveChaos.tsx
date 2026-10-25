import { X } from 'lucide-react';
import { useSim, type SimStore } from '@/stores/simStore';

export function ActiveChaosList({ store }: { store: SimStore }) {
  const items = useSim(store, (s) => s.activeChaos);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span
          key={c.key}
          className={`inline-flex items-center gap-1 rounded-full border bg-bg/90 py-0.5 pl-2.5 pr-1 text-xs backdrop-blur ${c.level === 'critical' ? 'border-bad/50 text-bad' : 'border-warn/50 text-warn'}`}
        >
          {c.label}
          <button className="rounded-full p-0.5 hover:bg-panel2" onClick={() => store.getState().apply(c.undo)} aria-label={`Undo: ${c.label}`}>
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}
