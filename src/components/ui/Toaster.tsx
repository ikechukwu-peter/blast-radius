import { useToasts } from '@/stores/toastStore';

const TONE = {
  info: 'border-line',
  success: 'border-good/50',
  warn: 'border-warn/50',
  error: 'border-bad/60',
};
const DOT = { info: 'bg-ok', success: 'bg-good', warn: 'bg-warn', error: 'bg-bad' };

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`br-toast pointer-events-auto flex items-center gap-2.5 rounded-lg border bg-panel px-3.5 py-2.5 text-left text-sm text-text shadow-2xl ${TONE[t.tone]}`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[t.tone]}`} />
          {t.message}
        </button>
      ))}
    </div>
  );
}
