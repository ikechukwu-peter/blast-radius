-- Blast Radius schema. Run this once in your own Supabase project:
-- Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Running it yourself (instead of asking Lovable) costs zero credits.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are public" on public.profiles
  for select using (true);
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'user_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- designs
create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled design' check (char_length(title) <= 120),
  description text check (char_length(description) <= 2000),
  graph jsonb not null,
  is_public boolean not null default false,
  share_slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  forked_from uuid references public.designs (id) on delete set null,
  review_score int check (review_score between 0 and 100),
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Guard against huge payloads: ~200 nodes is plenty.
  constraint graph_size check (pg_column_size(graph) < 256000)
);

create index if not exists designs_owner_idx on public.designs (owner_id, updated_at desc);
create index if not exists designs_public_idx on public.designs (is_public) where is_public;

alter table public.designs enable row level security;

create policy "read own or public designs" on public.designs
  for select using (is_public or auth.uid() = owner_id);
create policy "insert own designs" on public.designs
  for insert with check (auth.uid() = owner_id);
create policy "update own designs" on public.designs
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "delete own designs" on public.designs
  for delete using (auth.uid() = owner_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists designs_touch on public.designs;
create trigger designs_touch before update on public.designs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- challenge runs
-- Rows are written ONLY by the submit-run edge function (service role), which
-- re-runs the deterministic simulation server-side. No client insert policy exists.
create table if not exists public.challenge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  design_id uuid references public.designs (id) on delete set null,
  scenario_id text not null,
  score int not null check (score between 0 and 1000),
  survived boolean not null,
  slo_attainment numeric not null,
  worst_p99_ms numeric not null,
  monthly_cost_usd numeric not null,
  design_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists runs_scenario_score_idx on public.challenge_runs (scenario_id, score desc);
create index if not exists runs_user_recent_idx on public.challenge_runs (user_id, scenario_id, created_at desc);

alter table public.challenge_runs enable row level security;

create policy "runs are public" on public.challenge_runs
  for select using (true);

-- ---------------------------------------------------------------- leaderboard
-- Best run per user per scenario. Ties broken by lower cost, then earlier submission.
create or replace view public.leaderboard
with (security_invoker = true) as
select distinct on (r.scenario_id, r.user_id)
  r.scenario_id,
  r.user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  r.score,
  r.survived,
  r.worst_p99_ms,
  r.monthly_cost_usd,
  r.design_id,
  r.created_at
from public.challenge_runs r
join public.profiles p on p.id = r.user_id
order by r.scenario_id, r.user_id, r.score desc, r.monthly_cost_usd asc, r.created_at asc;
