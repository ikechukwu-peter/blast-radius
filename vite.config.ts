import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Serve the production security headers from vercel.json in `vite preview` too, so the
// smoke test runs under the same Content-Security-Policy as the live site.
const vercel = JSON.parse(readFileSync(path.resolve(__dirname, 'vercel.json'), 'utf8'));
const prodHeaders: Record<string, string> = Object.fromEntries(
  vercel.headers.find((h: { source: string }) => h.source === '/(.*)').headers.map((h: { key: string; value: string }) => [h.key, h.value]),
);
delete prodHeaders['Strict-Transport-Security'];

export default defineConfig({
  server: { host: '::', port: 8080 },
  preview: { headers: prodHeaders },
  plugins: [react()],
  worker: { format: 'es' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    // The WebLLM runtime (~6 MB) is a lazy chunk fetched only when someone starts the AI analyst.
    chunkSizeWarningLimit: 6500,
    rollupOptions: {
      output: {
        manualChunks: {
          flow: ['@xyflow/react'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
          webllm: ['@mlc-ai/web-llm'],
        },
      },
    },
  },
});
