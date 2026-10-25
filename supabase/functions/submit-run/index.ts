// Verified leaderboard submission.
// The client never sends a score: this function loads the caller's design, re-runs the
// deterministic simulation server-side, and writes the result with the service role.
//
// Deploy:  supabase functions deploy submit-run --project-ref <your-ref>
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { SCENARIOS, runScenario, validateDesign } from '../_shared/core/index.ts';
import type { Design } from '../_shared/core/index.ts';

const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_SUBMISSIONS_PER_HOUR = 10;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function isDesign(value: unknown): value is Design {
  const d = value as Design;
  return (
    !!d &&
    d.version === 1 &&
    Array.isArray(d.nodes) &&
    Array.isArray(d.edges) &&
    d.nodes.length <= MAX_NODES &&
    d.edges.length <= MAX_EDGES &&
    d.nodes.every((n) => typeof n?.id === 'string' && typeof n?.kind === 'string' && typeof n?.label === 'string') &&
    d.edges.every((e) => typeof e?.id === 'string' && typeof e?.source === 'string' && typeof e?.target === 'string')
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Sign in to submit a run.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Invalid session.' }, 401);

  let body: { designId?: unknown; scenarioId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }
  if (typeof body.designId !== 'string' || typeof body.scenarioId !== 'string') {
    return json({ error: 'designId and scenarioId are required.' }, 400);
  }

  const scenario = SCENARIOS.find((s) => s.id === body.scenarioId);
  if (!scenario) return json({ error: 'Unknown scenario.' }, 404);

  // Loaded with the caller's JWT, so RLS decides visibility; then ownership is checked explicitly.
  const { data: row, error: designError } = await userClient
    .from('designs')
    .select('id, owner_id, graph')
    .eq('id', body.designId)
    .maybeSingle();
  if (designError) return json({ error: 'Could not load design.' }, 500);
  if (!row || row.owner_id !== user.id) return json({ error: 'You can only submit your own designs.' }, 403);
  if (!isDesign(row.graph)) return json({ error: 'Design is malformed or too large.' }, 422);

  const issues = validateDesign(row.graph);
  if (issues.length) return json({ error: 'Design is not valid.', issues }, 422);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('challenge_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('scenario_id', scenario.id)
    .gte('created_at', since);
  if (countError) return json({ error: 'Could not check rate limit.' }, 500);
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_HOUR) {
    return json({ error: `Limit is ${MAX_SUBMISSIONS_PER_HOUR} submissions per scenario per hour.` }, 429);
  }

  const result = runScenario(row.graph, scenario);
  if (!result.eligible) {
    return json({ error: `Design needs: ${result.missingKinds.join(', ')}`, missingKinds: result.missingKinds }, 422);
  }

  const { data: run, error: insertError } = await admin
    .from('challenge_runs')
    .insert({
      user_id: user.id,
      design_id: row.id,
      scenario_id: scenario.id,
      score: result.score,
      survived: result.survived,
      slo_attainment: result.sloAttainment,
      worst_p99_ms: result.worstP99Ms,
      monthly_cost_usd: result.monthlyCostUsd,
      design_snapshot: row.graph,
    })
    .select('id, score, survived, created_at')
    .single();
  if (insertError) return json({ error: 'Could not save run.' }, 500);

  return json({
    run,
    result: {
      score: result.score,
      survived: result.survived,
      sloAttainment: result.sloAttainment,
      worstP99Ms: result.worstP99Ms,
      avgErrorRate: result.avgErrorRate,
      monthlyCostUsd: result.monthlyCostUsd,
      overBudget: result.overBudget,
    },
  });
});
