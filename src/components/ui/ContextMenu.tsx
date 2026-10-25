import { useEffect, useRef, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  hint?: string;
  tone?: 'bad' | 'warn' | 'good';
  onSelect: () => void;
}

export function ContextMenu({ x, y, title, items, onClose }: { x: number; y: number; title?: string; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - (items.length * 34 + 40));
  const tone = { bad: 'text-bad', warn: 'text-warn', good: 'text-good' };
  return (
    <div ref={ref} role="menu" className="panel fixed z-50 w-52 py-1 shadow-2xl" style={{ left, top }}>
      {title && <div className="truncate px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>}
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel2 ${item.tone ? tone[item.tone] : 'text-text'}`}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.icon}
          <span className="flex-1">{item.label}</span>
          {item.hint && <kbd className="font-num text-[10px] text-muted">{item.hint}</kbd>}
        </button>
      ))}
    </div>
  );
}
