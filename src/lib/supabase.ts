import { createClient } from '@supabase/supabase-js';

// Your own Supabase project (not Lovable Cloud).
// The anon/publishable key is designed to be public: Row Level Security in
// supabase/schema.sql is what protects the data. Never put the service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR-PROJECT-REF.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR-ANON-OR-PUBLISHABLE-KEY';

/** False until you set real credentials; the app then runs fully offline (no save/share/leaderboard). */
export const isSupabaseConfigured = !url.includes('YOUR-PROJECT-REF') && !anonKey.startsWith('YOUR-');

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const SUPABASE_URL = url;
