import type { Design } from '@/core';
import { ALL_TEMPLATES } from '@/lib/cloudTemplates';
import { Modal } from '@/components/ui/Modal';

export function TemplatePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (design: Design | null, title: string) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Start from a template" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {ALL_TEMPLATES.map((t) => (
          <button key={t.id} onClick={() => onPick(t.design, t.title)} className="rounded-lg border border-line bg-panel2/50 p-4 text-left transition-colors hover:border-ok/50">
            <div className="font-display text-base font-semibold">{t.title}</div>
            <div className="mt-1 text-sm text-muted">{t.description}</div>
            <div className="mt-3 font-num text-[11px] text-muted">
              {t.design.nodes.length} components · {t.design.edges.length} connections
            </div>
          </button>
        ))}
        <button onClick={() => onPick(null, 'Untitled design')} className="rounded-lg border border-dashed border-line p-4 text-left transition-colors hover:border-ok/50">
          <div className="font-display text-base font-semibold">Blank canvas</div>
          <div className="mt-1 text-sm text-muted">Start from scratch.</div>
        </button>
      </div>
    </Modal>
  );
}
