# 006 — An on-device model over a hosted AI API

## Context

After a failed challenge, the useful question is "why, and what's the cheapest fix?". A conversational answer helps, but a hosted API needs a key, costs money per question, needs a server to hide the key, and sends the user's design to a third party.

## Options

- **Hosted API behind an edge function.** Best answers. Running cost, rate limiting, a privacy policy, and a key to protect.
- **Bring-your-own-key.** No cost to me, friction for every visitor, and keys pasted into a web page.
- **A small open model in the browser** via WebGPU. Free, private, offline after the first load. Weaker reasoning.

## Decision

[WebLLM](https://github.com/mlc-ai/web-llm) runs a small open model on the visitor's GPU, inside a Web Worker so the canvas keeps animating ([analystStore.ts L108](../../src/ai/analystStore.ts#L108)). It is opt-in: nothing downloads until the user picks a model and presses start. The default is Qwen 2.5 1.5B (about 1 GB, cached by the browser); a lighter Llama 3.2 1B and a stronger Phi-3.5 mini are offered.

Small models invent numbers when they aren't given them, so the model is never asked to judge the design. [context.ts](../../src/ai/context.ts#L51) turns the engine's output (components, review findings, live per-node state, the incident log, a challenge's second-by-second result) into a compact fact sheet that fits a 4k-token window, and the system prompt ([L147](../../src/ai/context.ts#L147)) tells it to use only those facts and quote numbers exactly. Each question shows a "facts the model saw" disclosure.

## Consequences

- No API key, no running cost, and the design never leaves the browser. The only new network traffic is the model weights from Hugging Face and its compiled kernel from GitHub, both allowed explicitly in the Content-Security-Policy.
- Needs WebGPU: current Chrome, Edge and Arc on desktop, Safari 26+. Elsewhere the panel explains why, and everything else still works.
- A 1.5B model doesn't reliably find the key number in a page of facts. On the first real run it called a 600%-loaded API "underutilized". So the engine now computes a headline (main bottleneck, what's down, active chaos) at the top of the fact sheet ([context.ts](../../src/ai/context.ts)), and the model explains that. Answers are still sometimes imprecise, so the panel says so, and the deterministic numbers stay on screen as the source of truth.
- Measured on a Mac's Apple GPU: 6–10 s per answer, 3 s to load from cache. The first ~1 GB download took 19 minutes on a slow connection.
- The WebLLM runtime is about 2 MB gzipped and is fetched twice (once for the page, once for the worker), in lazy chunks that load only when the analyst starts. The initial page never includes it.
