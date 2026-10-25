import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GitFork, Pencil, Trophy } from 'lucide-react';
import { createDesign, getDesignBySlug, getProfileName, type DesignRow } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/stores/authStore';
import { useDesign } from '@/stores/designStore';
import { toast } from '@/stores/toastStore';
import { Brand, UserMenu } from '@/components/Layout';
import { Workspace } from '@/components/editor/Workspace';
import { EditorSkeleton } from '@/components/ui/Skeleton';

export default function SharedPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [loaded, setLoaded] = useState<{ slug: string; row: DesignRow | null; author: string | null; failed: boolean } | null>(null);
  const current = loaded?.slug === slug ? loaded : null;
  const row = current?.row ?? null;
  const author = current?.author ?? null;
  const state: 'loading' | 'ready' | 'notfound' | 'error' = !isSupabaseConfigured
    ? 'error'
    : !current
      ? 'loading'
      : current.failed
        ? 'error'
        : current.row
          ? 'ready'
          : 'notfound';
  const [forking, setForking] = useState(false);

  useEffect(() => {
    if (!slug || !isSupabaseConfigured) return;
    let cancelled = false;
    getDesignBySlug(slug)
      .then(async (r) => {
        const name = r ? await getProfileName(r.owner_id) : null;
        if (cancelled) return;
        if (r) useDesign.getState().loadDesign(r.graph, { source: 'shared', title: r.title, savedId: null, authorName: name, ownerId: r.owner_id });
        setLoaded({ slug, row: r, author: name, failed: false });
      })
      .catch(() => !cancelled && setLoaded({ slug, row: null, author: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const fork = async () => {
    if (!row) return;
    if (!user) return navigate(`/auth?next=/s/${slug}`);
    setForking(true);
    try {
      const copy = await createDesign({ title: `${row.title} (fork)`.slice(0, 120), graph: row.graph, forked_from: row.id, review_score: row.review_score });
      toast('Forked to your designs', 'success');
      navigate(`/d/${copy.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fork failed', 'error');
    } finally {
      setForking(false);
    }
  };

  if (state === 'loading') return <EditorSkeleton readOnly />;
  if (state !== 'ready' || !row) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">{state === 'notfound' ? 'This design is private or gone' : 'Could not load this design'}</h1>
        <p className="max-w-sm text-sm text-muted">{isSupabaseConfigured ? 'Ask the owner to make it public, or build your own.' : 'Sharing needs a Supabase project. See the README.'}</p>
        <Link to="/play" className="btn-primary">
          Build your own
        </Link>
      </div>
    );
  }

  const isOwner = user?.id === row.owner_id;
  return (
    <Workspace
      readOnly
      fitKey={row.id}
      headerLeft={
        <>
          <Brand />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{row.title}</div>
            <div className="truncate text-[11px] text-muted">by {author ?? 'someone'} · read-only. Play it, break it, fork it.</div>
          </div>
        </>
      }
      headerRight={
        <>
          <Link to="/challenges" className="btn hidden sm:inline-flex">
            <Trophy size={14} /> Challenges
          </Link>
          {isOwner ? (
            <Link to={`/d/${row.id}`} className="btn-primary">
              <Pencil size={14} /> Edit
            </Link>
          ) : (
            <button className="btn-primary" onClick={fork} disabled={forking}>
              <GitFork size={14} /> Fork to edit
            </button>
          )}
          <div className="hidden sm:block">
            <UserMenu />
          </div>
        </>
      }
    />
  );
}
