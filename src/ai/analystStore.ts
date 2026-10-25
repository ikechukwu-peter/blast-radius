import { create } from 'zustand';
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { DEFAULT_MODEL } from './models';
import { SYSTEM_PROMPT } from './context';

/**
 * On-device analyst: a small open model running on the user's GPU through WebLLM (WebGPU).
 * No API key, no server, nothing about the design leaves the browser. Only the model weights
 * are downloaded once (from Hugging Face) and cached by the browser.
 *
 * The heavy library is imported only when the user presses "Load", so it never touches the
 * initial bundle.
 */

export type AnalystStatus = 'idle' | 'checking' | 'unsupported' | 'loading' | 'ready' | 'generating' | 'error';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** What the model was shown when this question was asked (for the "facts used" disclosure). */
  context?: string;
}

interface AnalystState {
  status: AnalystStatus;
  modelId: string;
  loadedModelId: string | null;
  progress: number;
  progressText: string;
  error: string | null;
  unsupportedReason: string | null;
  cached: Record<string, boolean>;
  messages: ChatMessage[];
  setModel(id: string): void;
  checkSupport(): Promise<void>;
  refreshCache(ids: string[]): Promise<void>;
  load(): Promise<void>;
  ask(question: string, context: string): Promise<void>;
  stop(): void;
  clear(): void;
}

let engine: WebWorkerMLCEngine | null = null;

/**
 * Token budget for a 4k window: system prompt (~400) + facts (<=5000 chars, ~1.4k)
 * + 2 prior turns trimmed to 600 chars each + a 400-token answer.
 */
const HISTORY_TURNS = 2;
const PRIOR_CHARS = 600;

async function webgpuSupport(): Promise<string | null> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return 'This browser has no WebGPU. Use a recent Chrome, Edge or Arc on desktop (or Safari 26+).';
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return 'WebGPU is present but no GPU adapter is available (it may be disabled or blocklisted).';
  } catch {
    return 'WebGPU could not start on this device.';
  }
  return null;
}

export const useAnalyst = create<AnalystState>((set, get) => ({
  status: 'idle',
  modelId: DEFAULT_MODEL,
  loadedModelId: null,
  progress: 0,
  progressText: '',
  error: null,
  unsupportedReason: null,
  cached: {},
  messages: [],

  setModel(id) {
    set({ modelId: id });
  },

  async checkSupport() {
    if (get().status !== 'idle') return;
    set({ status: 'checking' });
    const reason = await webgpuSupport();
    set(reason ? { status: 'unsupported', unsupportedReason: reason } : { status: engine ? 'ready' : 'idle' });
  },

  async refreshCache(ids) {
    try {
      const { hasModelInCache } = await import('@mlc-ai/web-llm');
      const entries = await Promise.all(ids.map(async (id) => [id, await hasModelInCache(id)] as const));
      set({ cached: Object.fromEntries(entries) });
    } catch {
      /* cache API unavailable: treat as not cached */
    }
  },

  async load() {
    const { modelId, loadedModelId } = get();
    if (engine && loadedModelId === modelId) return set({ status: 'ready' });
    set({ status: 'loading', progress: 0, progressText: 'Starting…', error: null });
    try {
      const webllm = await import('@mlc-ai/web-llm');
      const onProgress = (r: { progress: number; text: string }) => set({ progress: r.progress, progressText: r.text });
      if (engine) {
        engine.setInitProgressCallback(onProgress);
        await engine.reload(modelId);
      } else {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: onProgress });
      }
      set({ status: 'ready', loadedModelId: modelId, progress: 1, cached: { ...get().cached, [modelId]: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({
        status: 'error',
        error: /memory|OOM|allocation/i.test(message)
          ? 'Not enough GPU memory for this model. Try the Light model.'
          : `Could not load the model: ${message}`,
      });
    }
  },

  async ask(question, context) {
    if (!engine || get().status === 'generating') return;
    const prior = get().messages.slice(-HISTORY_TURNS * 2);
    const messages: ChatMessage[] = [...get().messages, { role: 'user', content: question, context }, { role: 'assistant', content: '' }];
    set({ messages, status: 'generating', error: null });
    try {
      const stream = await engine.chat.completions.create({
        stream: true,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\n# Facts\n${context}` },
          ...prior.map((m) => ({ role: m.role, content: m.content.slice(0, PRIOR_CHARS) })),
          { role: 'user', content: question },
        ],
      });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.choices[0]?.delta?.content ?? '';
        const next = [...get().messages];
        next[next.length - 1] = { role: 'assistant', content: text };
        set({ messages: next });
      }
      set({ status: 'ready' });
    } catch (err) {
      set({ status: 'ready', error: err instanceof Error ? err.message : 'Generation failed' });
    }
  },

  stop() {
    engine?.interruptGenerate();
  },

  clear() {
    set({ messages: [] });
    engine?.resetChat().catch(() => {});
  },
}));
