import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/authStore';
import { LogoMark } from '@/components/ui/Logo';

function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export default function AuthPage() {
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/me';
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  const redirectTo = `${window.location.origin}${next}`;

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) {
      setError(error.message);
      setState('error');
    } else setState('sent');
  };

  const github = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } });
    if (error) {
      setError(error.message.includes('provider') ? 'GitHub sign-in is not enabled for this project yet. Use email instead.' : error.message);
      setState('error');
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-20">
      <LogoMark size={40} />
      <h1 className="mt-4 font-display text-2xl font-semibold">Sign in to Blast Radius</h1>
      <p className="mt-1 text-center text-sm text-muted">Save designs, share them, and put your score on the leaderboard.</p>

      {!isSupabaseConfigured ? (
        <div className="panel mt-8 w-full p-4 text-sm text-muted">
          Accounts are off because no Supabase project is connected. Add <code className="font-num text-text">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-num text-text">VITE_SUPABASE_ANON_KEY</code> (see README). Everything else works without an account.
        </div>
      ) : state === 'sent' ? (
        <div className="panel mt-8 w-full p-5 text-center">
          <Mail className="mx-auto text-ok" size={22} />
          <p className="mt-2 text-sm">
            Check <span className="font-semibold">{email}</span> for a sign-in link.
          </p>
        </div>
      ) : (
        <div className="mt-8 w-full space-y-4">
          <button className="btn w-full py-2" onClick={github}>
            <GithubMark /> Continue with GitHub
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <form onSubmit={sendLink} className="space-y-3">
            <label className="block">
              <span className="label">Email</span>
              <input className="input py-2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
            </label>
            <button className="btn-primary w-full py-2" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me a magic link'}
            </button>
          </form>
          {state === 'error' && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </div>
  );
}
