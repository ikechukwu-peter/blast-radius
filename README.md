# Blast Radius

An architecture diagram that runs. Draw your system like you would in draw.io (your own components, labelled links, bends, notes and zones), press Play, and requests flow through the design as particles, with live p50/p95/p99 and error rate. Then break it: kill the database primary, partition the network, add 4 seconds to a payment provider, send 10x traffic, and watch what survives. A rule-based reviewer grades the design A to F, five scripted incidents score it out of 1000 against SLOs and a budget, and an optional AI analyst, running on your own GPU, explains what went wrong.

**Try it: [blastradius.ikechukwupeter.com](https://blastradius.ikechukwupeter.com)**. No sign-up needed to design, simulate or take a challenge. Desktop Chrome, Edge or Arc is best; the AI analyst needs WebGPU.

```text
Design → seeded simulation (rates + sampled requests) → p99, errors, incidents → review / challenge score → on-device AI explains it
```

**[Read the case study](docs/case-study.md)** for the design, the trade-offs, and the bugs.

[![Architecture](docs/architecture.png)](docs/architecture.html)

The diagram is interactive and self-contained: open [architecture.html](docs/architecture.html) in a browser to trace paths, search and export. Its source is [docs/diagrams/architecture.json](docs/diagrams/architecture.json), rendered with Archify.

## What it does

- **Simulates, not animates.** Every 100 ms the engine pushes request rates through the graph in topological order. Each component serves up to its capacity and drops the rest, and latency climbs along an M/M/1 curve as utilization rises. Then about 200 synthetic requests walk the graph to measure real percentiles and timeouts. See [engine.ts L302](src/core/engine.ts#L302) and [L504](src/core/engine.ts#L504).
- **Is deterministic.** The random source is seeded, so a design and a scenario always produce the same numbers, in the browser and on the server. See [engine.ts L48](src/core/engine.ts#L48).
- **Models the failures engineers argue about.** Database failover with a configurable promotion time, autoscaling that takes warm-up seconds to help, circuit breakers that fail fast, client retries that multiply load into a storm, a dead cache passing every request to the database, and a queue that absorbs a slow provider until it fills. Each behaviour is pinned by a test in [engine.test.ts](tests/engine.test.ts).
- **Draws like a diagram tool.** Link from any side of a component, drag a link's end to reconnect it, drag the + on a link to bend it, and choose curved, right-angled or straight lines with arrowheads at either end, both or none. Double-click a link to label it. Add text notes and resizable zones (a VPC, a region, a team), select several with Shift, and copy, paste and duplicate with ⌘C, ⌘V and ⌘D, all with undo. See [TrafficEdge.tsx](src/components/editor/TrafficEdge.tsx) and [edgePath.ts](src/lib/edgePath.ts).
- **Lets you make your own components.** Name one (Kafka, Stripe, an LLM API), pick an icon and colour, and choose which built-in kind it **behaves like**, so the simulator knows how to run it. A starter library ships with event streams, object storage, search, auth, payments, email, an LLM API and an API gateway. See [libraryStore.ts](src/stores/libraryStore.ts).
- **Never lets a drawing break the simulation.** Requests need a direction and can't loop, so a link that would loop, point into the clients or duplicate another becomes a dashed **drawing-only** link with a one-line reason, instead of being refused. The engine ignores drawing-only links, notes and zones everywhere, including the server re-run. See [graph.ts](src/core/graph.ts) and [decision 009](docs/decisions/009-drawing-only-links.md).
- **Speaks AWS, Azure and Google Cloud.** 79 services, drawn with each provider's official architecture icon and full service name, each mapped to the behaviour the simulator should use (Lambda autoscales, Kinesis is a stream, Redshift is a warehouse). Stage columns (Ingestion, Data Lake, Computation, Data Warehouse, Presentation) centre the components you drop into them. Three data-platform templates, one per cloud, run healthy and grade A or B. See [cloudCatalog.ts](src/lib/cloudCatalog.ts) and [cloudTemplates.ts](src/lib/cloudTemplates.ts).
- **Turns any design into a video you can post.** The film button renders a 16:9, 1:1 or 9:16 MP4 of the design assembling itself, with flowing dashed links, requests in flight, your title and the link, in the browser, with nothing uploaded. The preview is the exact frames that get encoded. See [src/export/](src/export/) and [decision 010](docs/decisions/010-video-export-in-the-browser.md).
- **Lets you break things by hand.** Right-click a component to kill an instance, cause a full outage or degrade it; right-click a connection to add latency or partition it; set traffic from 0.5x to 10x. Every action lands in an incident log, and a list of active chaos lets you undo each one.
- **Shows traffic as it really moves.** Particle density follows request rate, speed follows latency, and colour turns red where requests fail. Particles freeze when the simulation is paused. See [TrafficEdge.tsx L58-L60](src/components/editor/TrafficEdge.tsx#L58-L60).
- **Reviews the design without guessing.** Graph analysis finds single points of failure, respecting the difference between load-balanced and fan-out calls. A 30-second headless run finds bottlenecks and idle spend. Other rules catch retries without a breaker, missing caches, synchronous third parties and queues with no consumer. Same design, same grade, every time. See [rules.ts](src/core/rules.ts).
- **Scores you against incidents.** *Black Friday*, *The Primary Is Gone*, *The Slow Provider*, *Cache Meltdown* and *Retry Storm* each script failures against your design. To survive, you have to stay within the latency and error SLOs for most of the run **and** under budget, so over-provisioning loses too. A reference design proves every scenario can be won. See [scenarios.ts L166](src/core/scenarios.ts#L166).
- **Verifies the leaderboard on the server.** The browser can't write a score. A Supabase edge function reloads your design, re-runs the scenario with the same engine and stores the result, along with the exact design that earned it. See [submit-run](supabase/functions/submit-run/index.ts#L95).
- **Explains results with an AI that runs on your GPU.** Open the **AI** tab, or ask after a challenge. A small open model (Qwen 2.5 1.5B by default) runs in the browser through WebLLM and WebGPU, with no API key and no server. It is given a fact sheet built from the engine's own output and told to use only those numbers. You can see exactly what it was shown. See [context.ts](src/ai/context.ts#L51) and [decision 006](docs/decisions/006-on-device-ai.md).
- **Works on phones.** On a portrait screen the diagram is shown top-to-bottom at full size instead of shrinking a left-to-right strip. It's a view transform, so the saved layout never changes ([viewTransform.ts](src/lib/viewTransform.ts)). Tapping a component while the simulation runs opens the chaos menu, since phones have no right-click.
- **Saves, shares and forks.** Sign in by email magic link or GitHub. Designs autosave; a public link lets anyone run and break your design, then fork it. Without an account, your draft is kept in the browser.

## Run it locally

```sh
npm install
npm run dev          # http://localhost:8080
npm test             # 96 unit tests: engine, reviewer, scenarios, drawing rules, link geometry, cloud catalog, video layout, AI fact sheet, store, edge-copy drift
npm run smoke        # after `npm run build`: headless Chrome drives the real app under the production CSP, on desktop and phone, including rendering a video (29 checks)
npm run check        # lint + types + tests + build + smoke, the same as CI
```

The app runs fully without a backend. Accounts, saving, sharing and the leaderboard appear when Supabase is configured:

```sh
cp .env.example .env.local            # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
supabase db push                      # tables, RLS policies, leaderboard view (supabase/migrations)
npm run sync:edge                     # copy src/core into the edge function (Deno needs .ts imports)
supabase functions deploy submit-run
```

**Warnings:**
- **After changing anything in `src/core/`, run `npm run sync:edge` and redeploy `submit-run`.** Otherwise server scores drift from what players see. CI fails when the copy is stale.
- **The AI analyst needs WebGPU** and downloads about 1 GB the first time; the browser caches it after that. Headless Chrome on CI has no GPU, so the smoke test only checks the opt-in screen.
- **Capacities and prices are illustrative defaults,** chosen so the trade-offs are visible, not benchmarks of real hardware.

## How it fits together

```text
src/core/             the engine: Simulation, reviewDesign, scenarios, templates, cost (pure TS, no DOM, tested)
src/ai/               on-device analyst: WebLLM worker, model list, fact-sheet builder, chat panel
src/stores/           zustand: design (edit + undo), simulation loop (rAF, chaos), auth, toasts
src/components/       canvas (React Flow nodes + particle edges), panels, telemetry, skeletons
src/pages/            landing, editor, shared view, challenges, leaderboard, my designs, sign-in
supabase/schema.sql   tables, row-level security, leaderboard view (also in supabase/migrations/)
supabase/functions/   submit-run: re-runs a scenario with a Deno copy of src/core and stores the score
vercel.json           SPA rewrites, Content-Security-Policy and security headers

tests/                engine, reviewer, scenarios, AI fact sheet, design store, edge-copy drift
tests/fixtures/       a reference design that beats every scenario (spoilers)
scripts/smoke.mjs     headless Chrome walkthrough + network allow-list check
.github/workflows/    CI: lint, types, tests with coverage, Deno check, browser smoke; weekly too

docs/case-study.md    the design, the trade-offs, the bugs
docs/decisions/       why the non-obvious choices were made
docs/architecture.html  interactive architecture diagram
```

## What leaves the browser, and when

| Component | What it sees | What it sends anywhere |
|---|---|---|
| Editor + engine | Your design, every simulated request | Nothing. The simulation runs in the tab. A signed-out draft is saved to `localStorage`. |
| AI analyst | A fact sheet about your design and run | Nothing. The model runs on your GPU. Starting it downloads the weights from Hugging Face and its compiled kernel from GitHub once, then they come from the browser cache. |
| Supabase (signed in) | The designs you save, your email or GitHub profile | Designs you save, and scores you submit. Row-level security keeps private designs private; public ones are visible to anyone with the link. |
| `submit-run` | The design you submit and your user id | It writes one leaderboard row. Drawing-only parts are ignored. |
| Your component library | Components you create | Nothing. It's saved in this browser's `localStorage`; the components inside a saved design travel with the design. |
| Vercel | Ordinary request details (IP, user agent) when files are downloaded | Not applicable. It never receives designs or chats. |

The [Content-Security-Policy](vercel.json) limits connections to the app's own origin, Supabase, Google Fonts and the two model hosts. The smoke test records every request the app makes and fails on any other host. The CSP is served in `vite preview` too, so the test runs under the real policy.

## Things worth knowing

**Determinism is the feature everything else stands on.** A seeded engine makes the tests exact, the leaderboard verifiable and the AI's numbers checkable. Without it, the server and the player would disagree about every score.

**A scenario no one can win, and one everyone wins, are both bugs.** The first version let a single-server design "survive" *The Slow Provider* because it had no third party to slow down. The autoscaler added one replica every 10 seconds, so *Black Friday* couldn't be won at any budget. Scenarios now require the component they target. Autoscaling now tracks its utilization target. A test proves a reference design wins every scenario within budget, and another proves over-provisioning loses.

**A small local model needs the answer's skeleton handed to it.** With a full fact sheet, Qwen 2.5 1.5B still called an API at 600% utilization "underutilized" and gave generic advice. The fix was to let the engine diagnose: the fact sheet now opens with a computed headline ("API is OVERLOADED at 600% of capacity (1 replica), dropping 5,000 rps"). The model then named the right bottleneck and the right fix, replicas and autoscaling, though it can still misquote a number. The fact sheet is capped at 5,000 characters to fit a 4k-token window alongside the prompt, two prior turns and the answer.

**A passing test suite proved little until it was attacked.** The first run passed 52 of 52. Breaking the engine on purpose showed that one test checked database load but not whether requests still succeeded after the cache died. It does now.

**A diagram tool can't refuse to draw.** The first version rejected links the simulator couldn't run (loops, links into clients, duplicates), which felt broken: you could see the line you wanted and the tool said no. Now they're kept as dashed drawing-only links with a reason, and the engine filters them out at its boundary. A test proves a design covered in loops, notes and zones scores exactly the same as the plain one.

**"Paused" has to look paused.** SVG animations keep running on the browser's clock after React stops updating. The canvas now calls `pauseAnimations()`, and the smoke test checks particle positions while paused.

## Deploy it

It's a static build plus a Supabase project. On Vercel:

```sh
vercel deploy --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the project. The anon key is designed to be public; row-level security protects the data. [vercel.json](vercel.json) adds the SPA rewrite, the CSP, HSTS, `nosniff`, a referrer policy, a `Permissions-Policy` and immutable caching for hashed assets.

**Custom domain:** add it under the project's Domains in Vercel (here `blastradius.ikechukwupeter.com`), create the CNAME record it shows, then add the domain to Supabase → Authentication → URL Configuration.

## Status

**Working:**
- editor, simulation, chaos, review, cost
- five challenges with local and verified scores
- accounts (magic link, GitHub), save, share, fork
- leaderboard verified on the server
- on-device AI analyst with three model sizes
- draw.io-style editing: custom components, labels, bends, arrowheads, notes, zones, multi-select, copy/paste
- AWS, Azure and Google Cloud icons, stage columns, three cloud data-platform templates
- video export (MP4, three aspect ratios), rendered in the browser
- 96 unit tests plus a 29-check browser smoke test (desktop and phone) on every push (GitHub Actions)

**Measured:** in [tests/](tests/) and on the live project.
- **Determinism:** identical scores across runs, and between Node and Deno, for every template and scenario.
- **Every challenge is winnable within budget,** and over-provisioning loses.
- **Security:** against the live database with a real session, a forged score insert is refused, a private design is invisible to an anonymous client, and a public link works logged out.
- **Privacy:** no request leaves the allowed hosts during a full smoke run.
- **AI analyst:** on a Mac's Apple GPU, Qwen 2.5 1.5B answers in 6–10 s and loads from cache in 3 s. The first download (about 1 GB) took 19 minutes on a slow connection.

**Not built:**
- **Real-time collaboration:** two people can't edit one design at once.
- **New behaviours:** custom components borrow one of the nine built-in behaviours; you can't define a new one.
- **Parent-child grouping:** zones are drawn behind components but don't carry them when moved; select both to move them together.
- **Calibration against real systems:** the model reproduces the shape of failures, not a particular cloud's numbers.
- **AI on phones:** WebGPU on mobile is uneven, so the analyst targets desktop. The rest of the app works on phones.

## Credits

Directed and verified by me: the product, the scenarios and their difficulty, the reviewer's rules, the decision to keep the AI on-device and grounded, and the failures that drove each fix (paused looking like running, unwinnable and trivially winnable challenges). The code, tests and docs were written with AI assistance (Claude), then checked with unit tests, a headless browser, the live database and a real model run before anything was called done.

- Canvas: [React Flow](https://reactflow.dev) (MIT). Charts: [Recharts](https://recharts.org) (MIT). Icons: [Lucide](https://lucide.dev) (ISC).
- On-device inference: [WebLLM](https://github.com/mlc-ai/web-llm) (Apache-2.0). Models, downloaded by the visitor's browser and not redistributed here: Qwen 2.5 1.5B Instruct (Apache-2.0), Llama 3.2 1B Instruct (Llama 3.2 Community License), Phi-3.5 mini (MIT).
- Backend: [Supabase](https://supabase.com). Diagram: [Archify](https://github.com/tt-a1i/archify) (MIT). Video encoding: [Mediabunny](https://mediabunny.dev) (MPL-2.0).
- Cloud icons: AWS Architecture Icons, Azure architecture icons and Google Cloud icons, trademarks of their owners, used unmodified for architecture diagrams. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT, for the code in this repo. The cloud provider icons are not covered; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Use it freely for learning, interviews, or as a starting point. If it helped you, I'd love to hear about it.
