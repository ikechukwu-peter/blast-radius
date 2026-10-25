# 007 — Supabase with row-level security over a custom backend

## Context

Accounts, saved designs, public share links and a leaderboard need a database and auth. A custom API server would be a second deployable, with its own auth bugs.

## Options

- **Custom API** (Node + Postgres). Full control, and every authorization check written by hand.
- **Supabase** with the client talking to Postgres directly, and authorization in row-level security policies.

## Decision

Supabase. The browser uses only the public anon key; [schema.sql](../../supabase/schema.sql) carries the rules: you can read your own designs or public ones; you can only write your own; nobody can write scores except the verifier ([004](004-server-verified-scores.md)); the leaderboard is a `security_invoker` view. A trigger creates a profile on sign-up. Auth is email magic link and GitHub.

## Consequences

- Authorization is declarative and lives next to the data, so there is no server route that can forget a check.
- Policies are easy to get subtly wrong, so they were tested against the live project with a real user: a private design is invisible to an anonymous client, a forged score insert is refused, a public share link works logged out.
- Without Supabase configured, the app still runs fully offline; saving, sharing and the leaderboard simply hide.
