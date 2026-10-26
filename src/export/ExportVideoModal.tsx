import { useEffect, useRef, useState } from 'react';
import { Download, Film, Loader2, X } from 'lucide-react';
import type { Design } from '@/core';
import { Modal } from '@/components/ui/Modal';
import { encodeVideo, type EncodedVideo } from './encode';
import { FORMATS, type VideoFormat } from './layout';
import { drawFrame, prepareScene, type Scene, type VideoOptions } from './renderer';

const LENGTHS = [8, 12, 16];

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-line" role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1.5 text-xs ${value === o.value ? 'bg-ok/15 text-ok' : 'text-muted hover:text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
      <input type="checkbox" className="accent-[var(--ok)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default function ExportVideoModal({ open, onClose, design, title }: { open: boolean; onClose: () => void; design: Design; title: string }) {
  const [opts, setOpts] = useState<VideoOptions>({ format: 'landscape', title, duration: 12, rightAngles: true, particles: true, endCard: true });
  const [scene, setScene] = useState<Scene | null>(null);
  const [rendering, setRendering] = useState<number | null>(null);
  const [result, setResult] = useState<(EncodedVideo & { url: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  const set = (patch: Partial<VideoOptions>) => {
    setOpts((o) => ({ ...o, ...patch }));
    setResult(null);
  };

  // (Re)build the scene whenever the options change; the preview and the encode share it.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    prepareScene(design, opts)
      .then((s) => !cancelled && setScene(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [open, design, opts]);

  // Live preview: exactly the frames that will be encoded, looping.
  useEffect(() => {
    if (!open || !scene || !canvas.current || rendering !== null) return;
    const c = canvas.current;
    c.width = scene.frame.width;
    c.height = scene.frame.height;
    const ctx = c.getContext('2d', { alpha: false })!;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      drawFrame(ctx, scene, ((now - t0) / 1000) % scene.opts.duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, scene, rendering]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const render = async () => {
    if (!scene) return;
    setError(null);
    setResult(null);
    setRendering(0);
    abort.current = new AbortController();
    try {
      const v = await encodeVideo(scene, setRendering, abort.current.signal);
      setResult({ ...v, url: URL.createObjectURL(v.blob) });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRendering(null);
    }
  };

  const fileName = `${(opts.title || 'design').replace(/[^\w-]+/g, '-').toLowerCase()}-${FORMATS[opts.format].label.replace(':', 'x')}`;
  const f = FORMATS[opts.format];

  return (
    <Modal
      open={open}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      title="Export as video"
      wide
    >
      <div className="grid gap-5 md:grid-cols-[1fr_250px]">
        <div className="min-w-0">
          <div className="flex items-center justify-center rounded-lg border border-line bg-bg p-2">
            {result ? (
              <video src={result.url} controls autoPlay loop muted playsInline className="max-h-[52vh] w-auto max-w-full rounded" />
            ) : (
              <canvas ref={canvas} className="max-h-[52vh] w-auto max-w-full rounded" style={{ aspectRatio: `${f.width} / ${f.height}` }} aria-label="Video preview" />
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {result ? 'Your video. Download it, then post it anywhere.' : 'Live preview of the exact frames that will be encoded.'}
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="label">Title</span>
            <input className="input" value={opts.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <div>
            <span className="label">Format</span>
            <Choice value={opts.format} onChange={(v) => set({ format: v })} options={(Object.keys(FORMATS) as VideoFormat[]).map((k) => ({ value: k, label: FORMATS[k].label, hint: FORMATS[k].hint }))} />
            <p className="mt-1 text-[11px] text-muted">{f.hint} · {f.width}×{f.height}</p>
          </div>
          <div>
            <span className="label">Length</span>
            <Choice value={opts.duration} onChange={(v) => set({ duration: v })} options={LENGTHS.map((s) => ({ value: s, label: `${s}s` }))} />
          </div>
          <div className="space-y-2">
            <Check label="Right-angle arrows (poster style)" checked={opts.rightAngles} onChange={(v) => set({ rightAngles: v })} />
            <Check label="Show requests flowing" checked={opts.particles} onChange={(v) => set({ particles: v })} />
            <Check label="End card with the link" checked={opts.endCard} onChange={(v) => set({ endCard: v })} />
          </div>

          {rendering !== null ? (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full bg-ok transition-[width]" style={{ width: `${Math.round(rendering * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Rendering {Math.round(rendering * 100)}%
                </span>
                <button className="flex items-center gap-1 hover:text-text" onClick={() => abort.current?.abort()}>
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          ) : result ? (
            <div className="space-y-2">
              <a className="btn-primary w-full py-2" href={result.url} download={`${fileName}.${result.ext}`}>
                <Download size={14} /> Download {result.ext.toUpperCase()} ({(result.blob.size / 1048576).toFixed(1)} MB)
              </a>
              {!result.shareable && <p className="text-[11px] text-warn">This browser could only make WebM, which X won't accept. Chrome, Edge or Safari make MP4.</p>}
              <button className="btn w-full" onClick={() => setResult(null)}>
                Change options
              </button>
            </div>
          ) : (
            <button className="btn-primary w-full py-2" onClick={render} disabled={!scene}>
              <Film size={14} /> Render video
            </button>
          )}
          {error && <p className="text-xs text-bad">{error}</p>}
          <p className="text-[11px] text-muted">Rendered on your device; nothing is uploaded.</p>
        </div>
      </div>
    </Modal>
  );
}
