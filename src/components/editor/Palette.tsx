import { useState, type ReactNode } from 'react';
import { Pencil, Plus, Search, Square, StickyNote, Trash2 } from 'lucide-react';
import { KIND_LABELS } from '@/core';
import { ICONS } from '@/lib/icons';
import { KIND_BLURBS, KIND_ICONS, PALETTE_ORDER } from '@/lib/kinds';
import { STARTER_LIBRARY, useLibrary, type CustomComponent } from '@/stores/libraryStore';
import { DRAG_MIME } from './FlowCanvas';

interface Item {
  key: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  custom?: CustomComponent;
}

function Tile({ item, compact, onAdd, onEdit, onDelete }: { item: Item; compact: boolean; onAdd: (key: string) => void; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="group relative">
      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_MIME, item.key);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onAdd(item.key)}
        title={`${item.subtitle}. Drag onto the canvas, or click to add.`}
        className={`flex w-full cursor-grab items-center gap-2.5 rounded-md border border-line bg-panel2/60 text-left transition-colors hover:border-ok/50 hover:bg-panel2 active:cursor-grabbing ${compact ? 'flex-col px-2 py-2 text-center' : 'px-2.5 py-2'}`}
      >
        <span className="shrink-0">{item.icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-text">{item.title}</span>
          {!compact && <span className="block truncate text-[11px] text-muted">{item.subtitle}</span>}
        </span>
      </button>
      {!compact && (onEdit || onDelete) && (
        <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
          {onEdit && (
            <button className="rounded p-1 text-muted hover:bg-bg hover:text-text" onClick={onEdit} aria-label={`Edit ${item.title}`}>
              <Pencil size={11} />
            </button>
          )}
          {onDelete && (
            <button className="rounded p-1 text-muted hover:bg-bg hover:text-bad" onClick={onDelete} aria-label={`Delete ${item.title}`}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, action, children, compact }: { title: string; action?: ReactNode; children: ReactNode; compact: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1.5 pt-3 first:pt-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</span>
        {action}
      </div>
      <div className={compact ? 'grid grid-cols-3 gap-2' : 'space-y-1.5'}>{children}</div>
    </div>
  );
}

export function Palette({
  onAdd,
  onEditComponent,
  compact = false,
}: {
  onAdd: (key: string) => void;
  onEditComponent: (draft: Partial<CustomComponent>) => void;
  compact?: boolean;
}) {
  const mine = useLibrary((s) => s.mine);
  const remove = useLibrary((s) => s.remove);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (i: Item) => !q || `${i.title} ${i.subtitle}`.toLowerCase().includes(q);

  const builtIns: Item[] = PALETTE_ORDER.map((kind) => {
    const Icon = KIND_ICONS[kind];
    return { key: kind, title: KIND_LABELS[kind], subtitle: KIND_BLURBS[kind], icon: <Icon size={15} className="text-ok" /> };
  });
  const library: Item[] = [...STARTER_LIBRARY, ...mine].map((c) => {
    const Icon = ICONS[c.icon] ?? KIND_ICONS[c.kind];
    return { key: `lib:${c.id}`, title: c.name, subtitle: c.blurb || `Behaves like ${KIND_LABELS[c.kind]}`, icon: <Icon size={15} style={{ color: c.color }} />, custom: c };
  });
  const drawing: Item[] = [
    { key: 'note', title: 'Text note', subtitle: 'A label anywhere on the canvas', icon: <StickyNote size={15} className="text-muted" /> },
    { key: 'zone', title: 'Zone', subtitle: 'Group components: VPC, region, team', icon: <Square size={15} className="text-muted" /> },
  ];

  const shown = { builtIns: builtIns.filter(match), library: library.filter(match), drawing: drawing.filter(match) };

  return (
    <div className="space-y-1">
      {!compact && (
        <label className="relative mb-2 block">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8 text-xs" placeholder="Search components" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search components" />
        </label>
      )}
      {shown.builtIns.length > 0 && (
        <Section title="Components" compact={compact}>
          {shown.builtIns.map((i) => (
            <Tile key={i.key} item={i} compact={compact} onAdd={onAdd} />
          ))}
        </Section>
      )}
      <Section
        title="Library"
        compact={compact}
        action={
          <button className="flex items-center gap-1 rounded px-1 text-[11px] text-ok hover:bg-panel2" onClick={() => onEditComponent({})}>
            <Plus size={12} /> New
          </button>
        }
      >
        {shown.library.map((i) => (
          <Tile
            key={i.key}
            item={i}
            compact={compact}
            onAdd={onAdd}
            onEdit={() => onEditComponent(i.custom!)}
            onDelete={i.custom?.builtIn ? undefined : () => remove(i.custom!.id)}
          />
        ))}
      </Section>
      {shown.drawing.length > 0 && (
        <Section title="Drawing" compact={compact}>
          {shown.drawing.map((i) => (
            <Tile key={i.key} item={i} compact={compact} onAdd={onAdd} />
          ))}
        </Section>
      )}
    </div>
  );
}
