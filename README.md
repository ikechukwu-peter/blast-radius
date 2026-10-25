# Blast Radius

**Your architecture diagram, but it runs.**

**Live:** https://blast-radius-tau-pink.vercel.app

Drag in load balancers, API servers, caches, databases, queues and third-party APIs. Press Play and requests flow through your design as particles, with live p50/p95/p99 and error rates. Then break things: kill the database primary, partition the network, add 4 seconds of latency to a provider, send 10x traffic. See what survives.

- **Simulate:** a deterministic queueing simulation, not an animation. Utilization, saturation latency, autoscaling with warm-up, database failover, circuit breakers, retry amplification, queue backpressure, and a cache dying into a thundering herd.
- **Review:** a rule-based design reviewer (no AI) that grades the design A–F. It finds single points of failure from graph analysis and finds bottlenecks from a headless 30s simulation run.
- **Prove:** five challenge scenarios with SLOs and a budget. Scores are verified server-side by re-running the same seeded simulation, so the leaderboard can't be faked.

## Run it

```bash
npm install
npm run dev        # http://localhost:8080
npm test           # engine tests + proof that every challenge is beatable
npm run build      # typecheck + production build
```

**The app works with no backend.** The editor, simulation, chaos, review, challenges and landing page all run in the browser, and your draft is saved in localStorage. Accounts, saving, sharing and the leaderboard light up once you connect Supabase.

## Connect Supabase (accounts, save/share, leaderboard)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor →** paste [`supabase/schema.sql`](supabase/schema.sql) **→ Run.** This creates the tables, Row Level Security policies, and the leaderboard view.
3. Copy `.env.example` to `.env.local` and fill in the Project URL and the anon/publishable key (Settings → API).
4. **Authentication → URL Configuration:** set the Site URL and add `http://localhost:8080/**` plus your production URL to Redirect URLs.
5. Optional: Authentication → Providers → GitHub, for "Continue with GitHub".
6. Deploy the anti-cheat leaderboard function:
   ```bash
   ./scripts/sync-core-to-edge.sh      # copies the engine for Deno; rerun after editing src/core
   supabase login
   supabase functions deploy submit-run --project-ref <your-project-ref>
   ```

## Deploy (Vercel)

1. Push to GitHub, then on Vercel: **Add New → Project →** import the repo. The preset is Vite.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
3. Deploy. `vercel.json` already rewrites routes like `/d/123` to the SPA.
4. Add the Vercel URL to Supabase's Redirect URLs.

## Project layout

```
src/
  core/            Simulation engine, rule-based reviewer, scenarios, templates (pure TS, no React)
  stores/          zustand: designStore (editing + undo), simStore (rAF loop, chaos), auth, toasts
  components/
    editor/        FlowCanvas, SystemNode, TrafficEdge (particles), panels, Workspace
    sim/           Live metrics, telemetry charts, incident log, chaos menu
  pages/           Landing, Editor (/play, /d/:id), Shared (/s/:slug), Challenges, Leaderboard, Me, Auth
  lib/             Supabase client + API, formatting, PNG export
supabase/
  schema.sql       Tables, RLS, leaderboard view
  functions/submit-run/   Edge function that re-runs scenarios server-side
scripts/
  smoke.ts         Engine behaviour tests
  solutions.ts     A reference design that beats every scenario (spoilers)
docs/SPEC.md       Product & UI spec
```

| Route | What it is |
|---|---|
| `/` | Landing page with a live demo that breaks itself every 8s |
| `/play` | Editor (local draft, template picker, 4-step tour) |
| `/d/:id` | Your saved design (autosaves) |
| `/s/:slug` | Public read-only view: run it, break it, fork it |
| `/challenges`, `/challenges/:id` | Scenario list; a run at 4x speed with a scored results chart |
| `/leaderboard` | Best verified score per engineer per scenario |
| `/me` | Your designs |

**Editor shortcuts:** `Space` play/pause · select a node, then `K` kill, `O` outage, `D` degrade, `R` recover · `⌘Z` / `⇧⌘Z` · `⌘S` save · `?` for the full list. Right-click nodes or edges while running for chaos.

## How the simulation works

Each 100ms tick runs two layers:

1. **Fluid model:** request rates flow through the DAG in topological order. Each node serves up to `capacityPerReplica × activeReplicas` and drops the rest. Latency follows an M/M/1-style curve `base / (1 − ρ)` capped at 20×. Load balancers split traffic across healthy targets; other nodes fan out to every dependency; caches forward only misses; queues buffer and drain at downstream worker capacity.
2. **Sampling:** about 200 synthetic requests per tick walk the graph, using each node's failure probability and latency from layer 1. That produces real p50/p95/p99, end-to-end error rate and client timeouts. The smoothed client error rate feeds retry amplification (`1 + e + e² + …`) into the next tick, which is how retry storms emerge on their own.

Autoscaling is target-tracking with a 10s sustain window and warm-up. Circuit breakers trip at more than 50% downstream failure, or when calls would exceed the client timeout, and stay open for 10s. Everything is seeded (`mulberry32`), so a design and scenario always produce the same score in the browser and on the server.

## Showing it off

A 30-second screen recording:
1. Load *The Weekend Project*, press Play, and show calm cyan particles.
2. Chaos → Traffic 10x. Everything turns red and p99 explodes.
3. Open Review: grade D, "Postgres is a single point of failure."
4. Run *Black Friday* with a fixed design. It survives with a score of 1000.
5. End on the leaderboard.

Caption: *"Think your architecture survives Black Friday? Prove it."*

## Using your Lovable credits on this (optional)

The app is complete without Lovable. If you still want to use the credits, the stack matches what Lovable generates (Vite, React, TypeScript, Tailwind, `@/` imports, port 8080). Create a Lovable project, connect it to GitHub, replace that repo's contents with this code and push. Lovable then picks up the code. Use it for UI polish, and tell it never to edit `src/core/` or `supabase/`. Don't enable Lovable Cloud; this app uses your own Supabase.
