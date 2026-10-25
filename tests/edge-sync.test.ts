import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The leaderboard function re-runs scenarios with a Deno copy of the engine. If the copy drifts
// from src/core, server scores stop matching what players saw. Fix: ./scripts/sync-core-to-edge.sh
describe('edge function engine copy', () => {
  const src = path.resolve(__dirname, '../src/core');
  const edge = path.resolve(__dirname, '../supabase/functions/_shared/core');

  it('matches src/core exactly, apart from Deno import extensions', () => {
    const files = readdirSync(src).filter((f) => f.endsWith('.ts'));
    expect(readdirSync(edge).sort()).toEqual(files.sort());
    for (const f of files) {
      const expected = readFileSync(path.join(src, f), 'utf8').replace(/from '(\.\/[\w-]+)'/g, "from '$1.ts'");
      expect(readFileSync(path.join(edge, f), 'utf8'), f).toBe(expected);
    }
  });
});
