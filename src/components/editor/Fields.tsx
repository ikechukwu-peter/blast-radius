export type FieldMeta = { label: string; unit?: string; min?: number; max?: number; step?: number; help?: string };

export function NumberField({ meta, value, onChange, disabled }: { meta: FieldMeta; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="label">
        {meta.label}
        {meta.unit && <span className="text-muted/60"> ({meta.unit})</span>}
      </span>
      <input
        type="number"
        className="input font-num"
        value={Number.isFinite(value) ? value : ''}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value === '' || Number.isNaN(v)) return;
          const lo = meta.min ?? -Infinity;
          const hi = meta.max ?? Infinity;
          onChange(Math.min(hi, Math.max(lo, v)));
        }}
      />
      {meta.help && <span className="mt-1 block text-[11px] text-muted/80">{meta.help}</span>}
    </label>
  );
}

export function PctField({ meta, value, onChange, disabled }: { meta: FieldMeta; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const max = meta.max ?? 1;
  return (
    <label className="block">
      <span className="label flex justify-between">
        <span>{meta.label}</span>
        <span className="font-num text-text">{(value * 100).toFixed(value < 0.1 ? 1 : 0)}%</span>
      </span>
      <input
        type="range"
        className="w-full accent-[var(--ok)]"
        min={0}
        max={max}
        step={max <= 0.5 ? 0.001 : 0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange, help, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string; disabled?: boolean }) {
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex w-full items-center justify-between rounded-md py-1 text-sm disabled:opacity-50"
      >
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-ok/70' : 'bg-line'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-text transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
      </button>
      {help && <span className="block text-[11px] text-muted/80">{help}</span>}
    </div>
  );
}
