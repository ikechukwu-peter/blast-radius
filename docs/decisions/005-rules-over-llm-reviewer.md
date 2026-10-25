# 005 — A rule-based reviewer over an LLM reviewer

## Context

The editor grades every design A–F and lists findings like "Postgres is a single point of failure". The obvious modern move is to ask a language model. But a grade that changes when you ask twice, or that invents a problem, teaches the wrong lesson and can't be tested.

## Options

- **LLM review.** Fluent, non-deterministic, unverifiable, and costs money or a large download per edit.
- **Rules.** Each finding is a check you can read, test and explain.

## Decision

[rules.ts](../../src/core/rules.ts) combines graph analysis with a 30-second headless simulation:

- **Single points of failure** by removing each single-instance node and checking whether any client can still be served, respecting split vs fan-out semantics ([L60](../../src/core/rules.ts#L60)).
- **Capacity** from peak utilization in the headless run ([L214](../../src/core/rules.ts#L214)): overloaded, running hot, or idle and wasting money.
- **Resilience patterns:** retries without a circuit breaker, a database read with no cache, a synchronous third-party call, a queue with no consumer, failover missing or slow.

The language model came later ([006](006-on-device-ai.md)) and was given a narrower job: explain these findings and the simulation's numbers, never replace them.

## Consequences

- The same design always gets the same grade, and every rule has a test.
- Rules only find what they were written to find. A novel failure mode needs a new rule; the simulation itself will still show the failure when someone triggers it.
