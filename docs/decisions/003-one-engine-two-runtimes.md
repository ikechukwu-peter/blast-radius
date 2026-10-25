# 003 — One pure-TypeScript engine for the browser and the server

## Context

The same simulation has to run in three places: the editor (live, at 10 Hz), the reviewer (headless, on every edit) and the leaderboard verifier (on Supabase's Deno runtime). Three implementations would drift, and a drifted server would reject honest scores.

## Options

- **Port the engine to a server language.** Two codebases, guaranteed drift.
- **Run the browser bundle on the server** with a headless browser. Heavy and slow to start.
- **Keep the engine framework-free** and import it from both runtimes.

## Decision

`src/core/` has no React, no DOM and no Node APIs. The UI imports it through `@/core`; the edge function imports a copy made by [sync-core-to-edge.sh](../../scripts/sync-core-to-edge.sh), which only rewrites import paths to add the `.ts` extension Deno requires.

## Consequences

- One implementation, tested once ([tests/](../../tests/)). Node and Deno produce byte-identical scores for every template and scenario.
- The copy can still go stale if someone edits `src/core/` and forgets the script. [edge-sync.test.ts](../../tests/edge-sync.test.ts) fails CI when it does.
- UI concerns (positions, labels) live alongside the engine's data but are ignored by it, so the stored design is also the engine's input with no translation layer.
