import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

interface AuthState {
  ready: boolean;
  session: Session | null;
  user: User | null;
  init(): void;
  signOut(): Promise<void>;
}

let started = false;

export const useAuth = create<AuthState>((set) => ({
  ready: !isSupabaseConfigured,
  session: null,
  user: null,
  init() {
    if (started || !isSupabaseConfigured) return;
    started = true;
    supabase.auth.getSession().then(({ data }) => set({ session: data.session, user: data.session?.user ?? null, ready: true }));
    supabase.auth.onAuthStateChange((_event, session) => set({ session, user: session?.user ?? null, ready: true }));
  },
  async signOut() {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));

export function displayName(user: User | null): string {
  if (!user) return '';
  const m = user.user_metadata ?? {};
  return m.full_name || m.user_name || user.email?.split('@')[0] || 'You';
}
