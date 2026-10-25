import type { Design, ScenarioResult } from '@/core';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface DesignRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  graph: Design;
  is_public: boolean;
  share_slug: string;
  forked_from: string | null;
  review_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardRow {
  scenario_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  survived: boolean;
  worst_p99_ms: number;
  monthly_cost_usd: number;
  design_id: string | null;
  created_at: string;
}

export class BackendNotConfigured extends Error {
  constructor() {
    super('Connect your Supabase project to enable accounts, saving and the leaderboard (see README).');
  }
}

function ensure() {
  if (!isSupabaseConfigured) throw new BackendNotConfigured();
}

const COLUMNS = 'id, owner_id, title, description, graph, is_public, share_slug, forked_from, review_score, created_at, updated_at';

export async function listMyDesigns(userId: string): Promise<DesignRow[]> {
  ensure();
  const { data, error } = await supabase.from('designs').select(COLUMNS).eq('owner_id', userId).order('updated_at', { ascending: false });
  if (error) throw error;
  return data as DesignRow[];
}

export async function getDesign(id: string): Promise<DesignRow | null> {
  ensure();
  const { data, error } = await supabase.from('designs').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as DesignRow | null;
}

export async function getDesignBySlug(slug: string): Promise<DesignRow | null> {
  ensure();
  const { data, error } = await supabase.from('designs').select(COLUMNS).eq('share_slug', slug).maybeSingle();
  if (error) throw error;
  return data as DesignRow | null;
}

export async function createDesign(input: { title: string; graph: Design; review_score?: number | null; forked_from?: string | null }): Promise<DesignRow> {
  ensure();
  const { data, error } = await supabase.from('designs').insert(input).select(COLUMNS).single();
  if (error) throw error;
  return data as DesignRow;
}

export async function updateDesign(id: string, patch: Partial<Pick<DesignRow, 'title' | 'graph' | 'is_public' | 'review_score' | 'description'>>): Promise<void> {
  ensure();
  const { error } = await supabase.from('designs').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDesign(id: string): Promise<void> {
  ensure();
  const { error } = await supabase.from('designs').delete().eq('id', id);
  if (error) throw error;
}

export async function getProfileName(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.from('profiles').select('display_name, username').eq('id', userId).maybeSingle();
  return data?.display_name ?? data?.username ?? null;
}

export interface SubmitResponse {
  run: { id: string; score: number; survived: boolean; created_at: string };
  result: Pick<ScenarioResult, 'score' | 'survived' | 'sloAttainment' | 'worstP99Ms' | 'avgErrorRate' | 'monthlyCostUsd' | 'overBudget'>;
}

export async function submitRun(designId: string, scenarioId: string): Promise<SubmitResponse> {
  ensure();
  const { data, error } = await supabase.functions.invoke('submit-run', { body: { designId, scenarioId } });
  if (error) {
    // FunctionsHttpError carries the response; surface the server's message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  return data as SubmitResponse;
}

export async function getLeaderboard(scenarioId: string): Promise<LeaderboardRow[]> {
  ensure();
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('scenario_id', scenarioId)
    .order('score', { ascending: false })
    .order('monthly_cost_usd', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data as LeaderboardRow[];
}

/** Map of design_id -> share_slug for the public designs among the given ids. */
export async function publicSlugs(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length || !isSupabaseConfigured) return {};
  const { data } = await supabase.from('designs').select('id, share_slug').in('id', ids).eq('is_public', true);
  return Object.fromEntries((data ?? []).map((d) => [d.id, d.share_slug]));
}

export async function topScores(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};
  const { data } = await supabase.from('leaderboard').select('scenario_id, score').order('score', { ascending: false }).limit(500);
  const best: Record<string, number> = {};
  for (const r of data ?? []) best[r.scenario_id] = Math.max(best[r.scenario_id] ?? 0, r.score);
  return best;
}

// ------------------------------------------------ local results (no backend needed)

const RESULTS_KEY = 'br:results';
export interface LocalResult {
  score: number;
  survived: boolean;
  at: string;
}

export function readLocalResults(): Record<string, LocalResult> {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveLocalResult(scenarioId: string, result: LocalResult) {
  try {
    const all = readLocalResults();
    if (!all[scenarioId] || result.score >= all[scenarioId].score) all[scenarioId] = result;
    localStorage.setItem(RESULTS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
