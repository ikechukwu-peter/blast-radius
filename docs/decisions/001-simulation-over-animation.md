# 001 — A seeded simulation over an animation of traffic

## Context

Architecture diagrams are static. Tools that "animate" them move dots along edges at a fixed rate, which looks alive but says nothing: a dot reaching a dead database looks the same as one reaching a healthy one. The point of this project is that the picture tells the truth about the design, including how it fails.

## Options

- **Animate edges** and colour nodes by hand-written rules. Cheap, and wrong the moment two effects interact (a cache dying *and* retries).
- **Run a real discrete-event simulator** (every request an event in a priority queue). Accurate, but tens of thousands of events per second in a browser tab, and hard to make reproducible.
- **A time-stepped model with a seeded random source**, accurate enough to reproduce the behaviours engineers argue about, and cheap enough to run at 10 Hz alongside rendering.

## Decision

A time-stepped simulation, 100 ms per tick ([engine.ts L86](../../src/core/engine.ts#L86)), driven by a seeded `mulberry32` generator ([L48](../../src/core/engine.ts#L48)). The canvas renders what the engine computes; nothing on screen is decorative. Particle density comes from the edge's request rate, particle speed from the target's current latency, colour from its failure ratio.

## Consequences

- A design + scenario + seed always produces the same numbers. That one property makes the leaderboard verifiable ([004](004-server-verified-scores.md)) and the tests exact ([engine.test.ts](../../tests/engine.test.ts)).
- Behaviours emerge instead of being scripted: the retry storm, the thundering herd after a cache dies, a queue absorbing a slow provider. Each is pinned by a test.
- It is a model, not a benchmark. Capacities and costs are illustrative defaults, and the README says so.
