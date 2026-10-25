export interface AnalystModel {
  id: string;
  label: string;
  /** Approximate one-time download, shown to the user before they commit. */
  download: string;
  note: string;
}

/**
 * Small instruction-tuned models from WebLLM's prebuilt list (q4f16, 4k context).
 * All permissively licensed: Qwen 2.5 1.5B (Apache-2.0), Llama 3.2 (Llama 3.2 Community License),
 * Phi-3.5 mini (MIT). Weights are fetched by the visitor's browser, not redistributed here.
 */
export const ANALYST_MODELS: AnalystModel[] = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Balanced · Qwen 2.5 1.5B', download: '~1 GB', note: 'Best default for laptops' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Light · Llama 3.2 1B', download: '~0.7 GB', note: 'Older or integrated GPUs' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Sharp · Phi-3.5 mini', download: '~2.2 GB', note: 'Best reasoning; needs ~4 GB of GPU memory' },
];

export const DEFAULT_MODEL = ANALYST_MODELS[0].id;
