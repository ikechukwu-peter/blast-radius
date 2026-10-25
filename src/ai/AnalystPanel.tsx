import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, Cpu, Download, Send, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { useAnalyst } from './analystStore';
import { ANALYST_MODELS } from './models';

/** Minimal, injection-safe rendering of the model's markdown: paragraphs, lists, **bold**, `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-bg px-1 font-num text-[12px]">{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="list-disc space-y-1 pl-4">
        {list.map((li, i) => <li key={i}>{inline(li)}</li>)}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ''))}</p>);
    }
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export interface AnalystPanelProps {
  /** Called at ask time so the model always sees the latest state. */
  getContext: () => string;
  suggestions: string[];
  /** Short description of what the model is shown, e.g. "design, review and live telemetry". */
  scope: string;
}

export function AnalystPanel({ getContext, suggestions, scope }: AnalystPanelProps) {
  const s = useAnalyst();
  const [input, setInput] = useState('');
  const [showFacts, setShowFacts] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    s.checkSupport();
    s.refreshCache(ANALYST_MODELS.map((m) => m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [s.messages]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    setInput('');
    s.ask(question, getContext());
  };

  const ready = s.status === 'ready' || s.status === 'generating';
  const model = ANALYST_MODELS.find((m) => m.id === s.modelId) ?? ANALYST_MODELS[0];

  if (s.status === 'unsupported') {
    return (
      <div className="space-y-3 p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold"><Cpu size={15} className="text-warn" /> On-device AI isn't available here</div>
        <p className="text-muted">{s.unsupportedReason}</p>
        <p className="text-xs text-muted">The simulator and the deterministic review work everywhere; only the optional analyst needs WebGPU.</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-center gap-2 font-display text-base font-semibold"><Bot size={17} className="text-ok" /> AI incident analyst</div>
          <p className="mt-1 text-sm text-muted">Ask why your design failed and what to change. Answers are grounded in the simulator's own numbers.</p>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-good/30 bg-good/5 p-3 text-xs text-muted">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-good" />
          <span>Runs entirely on your GPU with WebLLM. No API key, no server: your design never leaves this browser. The model is downloaded once and cached.</span>
        </div>
        <label className="block">
          <span className="label">Model</span>
          <select className="input" value={s.modelId} disabled={s.status === 'loading'} onChange={(e) => s.setModel(e.target.value)}>
            {ANALYST_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {s.cached[m.id] ? 'cached' : m.download}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">{model.note}</span>
        </label>
        {s.status === 'loading' ? (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-bg">
              <div className="h-full bg-ok transition-[width]" style={{ width: `${Math.round(s.progress * 100)}%` }} />
            </div>
            <div className="flex justify-between gap-2 text-[11px] text-muted">
              <span className="truncate">{s.progressText}</span>
              <span className="font-num">{Math.round(s.progress * 100)}%</span>
            </div>
          </div>
        ) : (
          <button className="btn-primary w-full py-2" onClick={() => s.load()} disabled={s.status === 'checking'}>
            <Download size={14} /> {s.cached[s.modelId] ? 'Start analyst' : `Download & start (${model.download})`}
          </button>
        )}
        {s.error && <p className="text-xs text-bad">{s.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-good" /> {model.label.split('·')[1]?.trim()} · on-device</span>
        {s.messages.length > 0 && (
          <button className="flex items-center gap-1 hover:text-text" onClick={() => s.clear()} aria-label="Clear conversation">
            <Trash2 size={12} /> Clear
          </button>
        )}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {s.messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted">The analyst sees your {scope}. Try:</p>
            {suggestions.map((q) => (
              <button key={q} onClick={() => ask(q)} className="block w-full rounded-md border border-line bg-panel2/50 px-3 py-2 text-left text-[13px] hover:border-ok/50">
                {q}
              </button>
            ))}
          </div>
        )}
        {s.messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-6 rounded-lg bg-ok/10 px-3 py-2 text-text">
              {m.content}
              {m.context && (
                <button className="mt-1 block text-[10px] text-muted underline" onClick={() => setShowFacts(showFacts === i ? null : i)}>
                  {showFacts === i ? 'Hide' : 'Show'} the facts the model saw
                </button>
              )}
              {showFacts === i && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 font-num text-[10px] text-muted">{m.context}</pre>}
            </div>
          ) : (
            <div key={i} className="mr-2 text-muted [&_strong]:text-text">
              {m.content ? <Answer text={m.content} /> : <span className="br-breathe text-xs">Thinking on your GPU…</span>}
            </div>
          ),
        )}
        {s.error && <p className="text-xs text-bad">{s.error}</p>}
      </div>
      <form
        className="flex gap-2 border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this design or run…" aria-label="Ask the analyst" />
        {s.status === 'generating' ? (
          <button type="button" className="btn-icon shrink-0" onClick={() => s.stop()} aria-label="Stop generating">
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button className="btn-icon shrink-0" disabled={!input.trim()} aria-label="Send">
            <Send size={14} />
          </button>
        )}
      </form>
      <p className="px-3 pb-2 text-[10px] text-muted/80">Small local models can be wrong. The simulator's numbers are the source of truth.</p>
    </div>
  );
}
