# 004 — Re-running scores on the server over trusting the client

## Context

Anything the browser computes, the player can change. A leaderboard that accepts `{ score: 1000 }` from the client is a form, not a leaderboard.

## Options

- **Trust the client** and hope. Trivial to cheat with the browser console.
- **Sign scores in the client.** The signing key ships to the client, so it can be extracted.
- **Recompute on the server** from the design itself, using the same deterministic engine.

## Decision

Clients cannot write scores at all: `challenge_runs` has row-level security with a public read policy and **no** insert policy ([schema.sql L85-L104](../../supabase/schema.sql#L85-L104)). The only writer is the [`submit-run`](../../supabase/functions/submit-run/index.ts) edge function. It takes `{ designId, scenarioId }`, loads the design with the caller's own JWT (so row-level security proves ownership), validates its shape and size, re-runs the scenario ([L95](../../supabase/functions/submit-run/index.ts#L95)), and inserts the result with the service role. It also stores the exact design snapshot that earned the score and rate-limits to 10 submissions per scenario per hour.

## Consequences

- A forged insert from the client is refused by Postgres. That was checked against the live project with a real user session.
- The server's score always equals what the player saw, because both run the same seeded engine ([003](003-one-engine-two-runtimes.md)).
- The design can still be optimised to the scoring model, which is the point of the game. The model is public and so are the reference designs that win.
