export const fmtInt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '∞');

export const fmtRps = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : fmtInt(n));

export const fmtMs = (n: number) => {
  if (!Number.isFinite(n)) return '∞';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
};

export const fmtPct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export const fmtUsd = (n: number) => `$${fmtInt(n)}`;

export const fmtClock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const uid = (prefix = '') => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

/** "a" or "an", by the sound of the first letter (good enough for component names). */
export const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
