# Blast Radius: Product & UI Spec

> The product spec the UI was built against. Useful as context if you hand the repo to Lovable or another agent for changes.

**One line:** A system design canvas that actually runs. Drag in infrastructure, press Play, watch requests flow as particles, then break things and see what survives.

---

## 1. Ground rules for the codebase

1. **`src/core/` is the engine and is owned by hand.** Never modify, reformat, or "fix" files in `src/core/`. Import from `@/core` only. If the UI needs something the core doesn't expose, add it in `src/lib/` as a wrapper.
2. No Lovable AI, no Lovable-specific SDKs, no AI calls of any kind. The design reviewer is `reviewDesign()` from `@/core`.
3. Backend is plain Supabase via `@supabase/supabase-js`, with config read from `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`.
4. Stack: Vite, React, TypeScript, Tailwind, shadcn/ui, react-router, `@xyflow/react` (React Flow v12), `zustand`, `recharts`, `lucide-react`, `html-to-image` (PNG export).
5. State: `zustand` stores in `src/stores/`. No prop-drilling of simulation state.

## 2. Visual direction

"Mission control at 2am." Dark-first, calm until something breaks.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#07090f` | page background |
| `--panel` | `#0d111a` | panels, nodes |
| `--border` | `#1c2333` | hairlines |
| `--text` | `#e6e9f0` | primary text |
| `--muted` | `#7b8499` | secondary text |
| `--ok` | `#22d3ee` (cyan) | healthy traffic, particles |
| `--warn` | `#f59e0b` (amber) | hot (>80%), breaker open, degraded |
| `--bad` | `#f43f5e` (rose) | failing, down, partitioned |
| `--good` | `#34d399` (green) | survived, passing goals |

- Fonts: **Space Grotesk** for headings, **Inter** for UI, **JetBrains Mono** for every number (rps, ms, %, $).
- The canvas background is a faint dot grid. Nodes are dark cards with a 1px border whose color follows status. At high utilization the node gets a soft outer glow in the status color.
- Motion is meaningful: particles show traffic and red flashes show failure. No decorative animation.
- Light mode toggle is optional. If you add one, mirror the tokens above.

## 3. Domain model (from `@/core`)

Read `src/core/types.ts`. Key points:

- A `Design` is `{ version: 1, nodes: DesignNode[], edges: DesignEdge[] }`. Node `position` is UI-only and stored on the node.
- Node kinds: `client, cdn, load_balancer, api_server, cache, database, queue, worker, external_api`. Labels in `KIND_LABELS`, defaults in `KIND_DEFAULTS`, and which fields the properties panel shows in `EDITABLE_FIELDS`.
- **Edge semantics depend on the source node** (`isSplitKind(kind)`):
  - `client` and `load_balancer` **split**: each request goes to ONE child, chosen by `weight`.
  - Everything else **fans out**: each request calls EVERY child. `weight` (0..1) is the fraction of requests that make that call.
  - Show this in the UI: split edges render as thin solid lines, fan-out edges as normal lines. A tooltip on hover explains it.
- `new Simulation(design, { seed })` → call `sim.step(0.1)` repeatedly. Each step returns a `TickResult` with per-node `NodeRuntime`, per-edge `EdgeRuntime`, global `Metrics` and new `SimEvent`s.
- `sim.apply(action: ChaosAction)` injects chaos.
- `validateDesign(design)` returns blocking issues. Never construct a `Simulation` if it returns any.
- `reviewDesign(design)` returns `{ score, grade, findings, baseline, peakUtilization, monthlyCostUsd }`. It runs a 30s headless simulation (~50ms), so debounce it by 600ms after edits.
- `SCENARIOS`, `runScenario(design, scenario)`, `missingKinds(design, scenario)`: challenge mode.
- `TEMPLATES`: starter designs.
- `estimateMonthlyCost(design)`: cost breakdown.

## 4. Screens & routes

| Route | Screen | Auth |
|---|---|---|
| `/` | Landing page with a live hero demo | public |
| `/play` | Editor with a fresh design (template picker on first open) | public; autosaves to localStorage |
| `/d/:id` | Editor for a saved design | owner |
| `/s/:slug` | Shared design: read-only canvas + Play + Chaos + "Fork to edit" | public |
| `/challenges` | Scenario cards | public |
| `/challenges/:scenarioId` | Run a scenario against one of your designs | public; saving a score needs auth |
| `/leaderboard` | Best scores per scenario | public |
| `/me` | My designs grid | auth |
| `/auth` | Email magic link + GitHub OAuth | public |

### 4.1 Editor layout (`/play`, `/d/:id`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Top bar: logo · design title (editable) · Save · Share · Export PNG · ☾  │
├──────────┬──────────────────────────────────────────────┬────────────────┤
│ Palette  │                                              │ Right panel    │
│ (drag    │              React Flow canvas               │ tabs:          │
│  node    │         (particles over edges while          │ • Properties   │
│  kinds)  │                 running)                     │ • Review       │
│          │                                              │ • Cost         │
├──────────┴──────────────────────────────────────────────┴────────────────┤
│ Sim bar: ▶/⏸ · ⟲ reset · speed 1x/2x/5x · t=00:42 · Chaos ▾             │
│ Live strip: offered rps · throughput · error % · p50 · p95 · p99         │
│ Charts (collapsible): p99 latency + error rate over last 120s ·          │
│ Incident log (SimEvents, newest first, color by level)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

- Below 900px width: palette becomes a bottom sheet, the right panel becomes a drawer, and the canvas stays usable with touch. Below 640px show a banner: "Best on a larger screen". Never block the page.

### 4.2 Node card

- Lucide icon per kind: client `Users`, cdn `Globe`, load_balancer `Split`, api_server `Server`, cache `Zap`, database `Database`, queue `ListOrdered`, worker `Cog`, external_api `Cloud`.
- Shows: label, kind, `×N` replica badge (live `activeReplicas` while running; a `+k` warming badge when `warmingUntil.length > 0`).
- While running: a thin utilization bar (cyan <0.6, amber 0.6–0.8+, rose >1), current rps and latency in mono, and for queues a depth bar plus `lag Xs`.
- Status styling: healthy (default border), degraded (amber border + "DEGRADED" chip), failing_over (amber pulsing border + "FAILING OVER" chip), down (rose border, card at 50% opacity, `Skull` icon, "DOWN" chip).
- Handles: target on the left, source on the right. Clients have no target handle.
- Right-click menu while running: Kill instance, Full outage, Degrade, Recover.

### 4.3 Particles (the wow)

Custom React Flow edge component `TrafficEdge`:

- Path from `getBezierPath`. Base stroke is `--border`. While running, stroke opacity scales with traffic.
- Particle count from `rps`: `clamp(round(log10(rps + 1) * 2), 0, 8)`. Particles are small circles (r=2.5) with a soft glow, animated with SVG `<animateMotion>` along the edge path, evenly offset with `begin`.
- Particle duration: `clamp(0.5 + (hopLatency + targetNode.latencyMs) / 300, 0.5, 4)` seconds, so slow paths visibly crawl.
- Color: `failingRps / (rps + failingRps) > 0.2` or target status `down` → rose particles. Breaker open → amber dashed stroke + a small `Zap` "OPEN" pill at the midpoint, no particles. Partitioned → rose dashed stroke + a `Scissors` pill.
- **Performance:** only re-render an edge when its particle-count bucket, color or duration bucket changes (memoize on those derived values, not raw rps), so `<animateMotion>` doesn't restart every tick. Target 60fps with 30 nodes.
- On an edge label (hover only): `1,234 rps · 12ms`.

### 4.4 Simulation loop

- `src/stores/simStore.ts` owns one `Simulation` instance, created from the current design when Play is pressed.
- Loop: `requestAnimationFrame`. Accumulate `realDt * speed`, then call `sim.step(0.1)` once per 0.1s of accumulated time (max 20 steps per frame).
- Publish the latest `TickResult` to the store at most 10x/second. Append to a 120-entry history ring buffer once per simulated second (for charts).
- Collect `events` into an incident log (keep the last 200).
- **Any design edit while running resets the simulation** and shows a toast: "Design changed. Simulation reset."
- Reset clears history and the incident log.

### 4.5 Chaos

A "Chaos" dropdown in the sim bar plus the node and edge context menus:

- Node: Kill instance (`kill_instance`), Full outage (`outage`), Degrade, Recover.
- Edge (right-click while running): +500ms latency, +2000ms latency, Partition, Heal.
- Global: Traffic 0.5x / 1x / 2x / 5x / 10x, "Recover everything" (`recover_all`).
- Keyboard: select a node, then `K` kill, `O` outage, `D` degrade, `R` recover. `Space` play/pause. `Backspace` deletes when stopped.
- Every chaos action produces a SimEvent (from the engine), which lands in the incident log.

### 4.6 Review panel

- Calls `reviewDesign(design)` debounced at 600ms after edits (not while running).
- Header: big grade letter (A green → F rose), score `/100`, monthly cost, baseline p99 and error rate from `review.baseline`.
- Findings list grouped by severity with colored dots. Each shows title, detail, and a "Fix:" line. Clicking a finding selects and pans to its nodes and pulses them for 1.5s.
- When `findings` is empty: "No issues found. Now try to break it." with a button that opens Chaos.

### 4.7 Cost panel

`estimateMonthlyCost(design)` as a table: component, replicas, $/mo, total. Note: "Autoscaled services are billed at their baseline replica count."

### 4.8 Challenge mode (`/challenges/:scenarioId`)

1. Briefing card: title, tagline, briefing, goals (p99 ≤ X ms, errors ≤ Y%, budget ≤ $Z/mo), duration, required components.
2. Pick a design: current local design, one of "My designs", or a template.
3. If `missingKinds()` is non-empty, show "Your design needs: …" and disable Run.
4. **Run:** play it visually. Create a `Simulation` with seed `1337`, warm up 100 ticks off-screen, then play the scenario timeline in real time at 4x speed on the canvas with timeline captions as toasts. Show a progress bar with event markers.
5. Results come from `runScenario(design, scenario)` (headless, authoritative): score /1000, survived badge, SLO attainment %, worst p99, average error rate, cost vs budget, and a per-second chart of p99 and error with the SLO lines drawn and failing seconds shaded rose.
6. "Submit to leaderboard" (needs auth) → calls the `submit-run` edge function (section 6.3).
7. "Share result" copies `/s/:slug?scenario=<id>`.

### 4.9 Landing page (`/`)

- Hero: headline **"Your architecture diagram, but it runs."** Subhead: "Drag in servers, caches and queues. Press play. Then break things and watch what survives."
- Right of the hero: a **live, non-interactive canvas** running the `event-driven` template. Every 8 seconds it injects a random chaos action and recovers 5 seconds later, with a caption chip ("Payment provider +4000ms…"). This loop is the product demo.
- CTAs: "Start building" → `/play`, "Take a challenge" → `/challenges`.
- Three feature blocks: *Simulate* (particles + live p99), *Break* (chaos + incident log), *Prove* (challenges + leaderboard).
- Scenario strip: the 5 scenario cards.
- Footer: GitHub link, "Built by <name>".

## 5. Data model (Supabase)

`supabase/schema.sql` is the source of truth. Run it in the Supabase SQL editor yourself, not through Lovable. Tables:

- `profiles(id → auth.users, username, display_name, avatar_url)`: auto-created on signup.
- `designs(id, owner_id, title, description, graph jsonb, is_public, share_slug, forked_from, review_score, thumbnail_url, timestamps)`.
- `challenge_runs(id, user_id, design_id, scenario_id, score, survived, slo_attainment, worst_p99_ms, monthly_cost_usd, design_snapshot, created_at)`: **inserted only by the edge function** (service role). Clients can read but not insert.
- View `leaderboard`: best run per user per scenario, joined with profile.

## 6. Backend behaviour

### 6.1 Save / load
- Anonymous users: design autosaves to `localStorage` key `br:draft`. Save prompts sign-in, then inserts the draft.
- Signed-in: `designs` row; autosave debounced at 1.5s; "Saved ✓" indicator in the top bar.
- Save also writes `review_score` from the current review.

### 6.2 Share / fork
- Share dialog: toggle `is_public`, copy `/s/:share_slug`.
- `/s/:slug` loads by `share_slug` (RLS allows public rows). "Fork to edit" inserts a copy with `forked_from` set and navigates to `/d/:newId`.

### 6.3 Verified leaderboard (anti-cheat)
- Edge function `submit-run` (Deno). Body: `{ designId, scenarioId }`.
- It loads the design with the caller's JWT (so RLS proves ownership), **re-runs `runScenario` server-side** using a copy of the core in `supabase/functions/_shared/core/`, and inserts the result with the service role key.
- Because the engine is deterministic (seeded), the server score always equals what the player saw. Client-reported scores are never trusted.
- Rate limit: max 10 submissions per user per scenario per hour (count recent rows before insert).

## 7. Non-goals (v1)

No real-time multiplayer editing, no AI, no payments, no custom node kinds, no import from other diagram tools.
