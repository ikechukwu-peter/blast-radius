# 002 — A fluid model plus sampled requests over simulating every request

## Context

The numbers people care about are tail latency (p99), error rate and saturation. Averages hide all three. But simulating each of 20,000 requests per second individually, in a tab that also animates a canvas, is not affordable, and per-request simulation makes determinism fragile.

## Options

- **Per-request discrete events.** Exact percentiles, too slow at realistic rates.
- **Pure fluid (rates only).** Fast, but only yields means; no p99, no timeouts.
- **Both, layered:** rates for load, a small sample of synthetic requests for percentiles.

## Decision

Two layers per tick ([engine.ts L302](../../src/core/engine.ts#L302), [L504](../../src/core/engine.ts#L504)):

1. **Fluid.** Request rates flow through the graph in topological order. Each node serves up to its capacity and drops the rest; latency follows an M/M/1-style curve, `base / (1 − ρ)`, capped at 20× ([L373](../../src/core/engine.ts#L373)). Load balancers and clients split traffic; every other component calls all of its dependencies; caches forward misses; queues buffer and drain at downstream worker capacity.
2. **Sampling.** About 200 synthetic requests walk the graph using each node's failure probability and latency from layer 1. Their latencies give real p50/p95/p99 over a 1-second window; any that exceed the client timeout count as failures ([L556](../../src/core/engine.ts#L556)).

Feedback closes the loop: the sampled error rate drives retry amplification on the next tick ([L317](../../src/core/engine.ts#L317)).

## Consequences

- A full 120-second scenario runs headless in about 0.3 s, so the reviewer can simulate on every edit and the server can re-score a submission inside an edge function's time budget.
- Percentiles carry sampling noise of a few percent. Because the generator is seeded, the noise is identical on every run, so it never changes a score.
- Requests are assumed independent. Correlated failures (a slow node making its own retries slower) are approximated through the retry feedback, not modelled per request.
