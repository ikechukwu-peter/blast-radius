# 008 — SVG particles with bucketed props over a canvas renderer

## Context

Traffic is drawn as particles moving along edges. The simulation publishes new numbers ten times a second; re-rendering hundreds of animated elements at that rate stutters, and restarting an animation every tick makes particles jump back to the start.

## Options

- **A canvas overlay** that redraws every frame. Smooth, but it has to re-implement React Flow's edge geometry, zoom and pan.
- **SVG `<animateMotion>`** on React Flow's own edge paths, re-rendered only when what you can see changes.

## Decision

[TrafficEdge.tsx](../../src/components/editor/TrafficEdge.tsx) uses SVG `animateMotion` on the edge's path. Raw numbers are bucketed before they reach the particle component: count from `log10(rps)` capped at 8 ([L58](../../src/components/editor/TrafficEdge.tsx#L58)), duration from latency rounded to 0.25 s ([L60](../../src/components/editor/TrafficEdge.tsx#L60)), and a three-way colour. The memoized `Particles` component ([L21](../../src/components/editor/TrafficEdge.tsx#L21)) re-renders only when a bucket changes, so the browser's animation clock runs uninterrupted between ticks. Pausing the simulation freezes them with `pauseAnimations()` ([FlowCanvas.tsx L73](../../src/components/editor/FlowCanvas.tsx#L73)).

## Consequences

- Pan, zoom and edge routing stay React Flow's job.
- Particles show rate and latency qualitatively, not one dot per request. The exact numbers are on the node cards and in the telemetry strip.
- An early version kept animating while paused, which made "paused" look like "running". The browser smoke test now checks that particles move while running and freeze while paused.
