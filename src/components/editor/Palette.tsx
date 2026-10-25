import { KIND_LABELS, type NodeKind } from '@/core';
import { KIND_BLURBS, KIND_ICONS, PALETTE_ORDER } from '@/lib/kinds';
import { DRAG_MIME } from './FlowCanvas';

export function Palette({ onAdd, compact = false }: { onAdd: (kind: NodeKind) => void; compact?: boolean }) {
  return (
    <div className={compact ? 'grid grid-cols-3 gap-2' : 'space-y-1.5'}>
      {!compact && <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Components</div>}
      {PALETTE_ORDER.map((kind) => {
        const Icon = KIND_ICONS[kind];
        return (
          <button
            key={kind}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, kind);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => onAdd(kind)}
            title={`${KIND_BLURBS[kind]}. Drag onto the canvas, or click to add.`}
            className={`group flex w-full cursor-grab items-center gap-2.5 rounded-md border border-line bg-panel2/60 text-left transition-colors hover:border-ok/50 hover:bg-panel2 active:cursor-grabbing ${compact ? 'flex-col px-2 py-2 text-center' : 'px-2.5 py-2'}`}
          >
            <Icon size={15} className="shrink-0 text-ok" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-text">{KIND_LABELS[kind]}</span>
              {!compact && <span className="block truncate text-[11px] text-muted">{KIND_BLURBS[kind]}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
