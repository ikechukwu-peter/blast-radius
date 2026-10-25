import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Copy, Download, FilePlus2, Save, Share2 } from 'lucide-react';
import type { Design } from '@/core';
import { createDesign, getDesign, updateDesign } from '@/lib/api';
import { exportCanvasPng } from '@/lib/exportPng';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/stores/authStore';
import { readDraft, useDesign } from '@/stores/designStore';
import { toast } from '@/stores/toastStore';
import { Brand, NavLinks, UserMenu } from '@/components/Layout';
import { TemplatePicker } from '@/components/editor/TemplatePicker';
import { Workspace } from '@/components/editor/Workspace';
import { Modal } from '@/components/ui/Modal';
import { EditorSkeleton } from '@/components/ui/Skeleton';

const EMPTY: Design = { version: 1, nodes: [], edges: [] };

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const authReady = useAuth((s) => s.ready);
  const title = useDesign((s) => s.title);
  const savedId = useDesign((s) => s.savedId);
  const saveVersion = useDesign((s) => s.saveVersion);
  const isPublic = useDesign((s) => s.isPublic);
  const shareSlug = useDesign((s) => s.shareSlug);

  const [picks, setPicks] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(() => !id && !readDraft()?.design.nodes.length);
  const [fetched, setFetched] = useState<{ id: string; state: 'ready' | 'notfound' | 'error' } | null>(null);
  const [saveResult, setSaveResult] = useState<{ version: number; ok: boolean } | null>(null);
  const [creating, setCreating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // /play: the draft lives in this browser and loads straight into the design store.
  useEffect(() => {
    if (!id) useDesign.getState().loadDraft();
  }, [id]);

  // /d/:id: fetch once per id (the route remounts this page per id, see App.tsx).
  const alreadyLoaded = useDesign((s) => !!id && s.savedId === id && s.source === 'saved');
  const loadState: 'loading' | 'ready' | 'notfound' | 'error' =
    !id || alreadyLoaded ? 'ready' : !isSupabaseConfigured ? 'error' : fetched?.id === id ? fetched.state : 'loading';

  useEffect(() => {
    if (!id || !isSupabaseConfigured || !authReady || useDesign.getState().savedId === id) return;
    let cancelled = false;
    getDesign(id)
      .then((row) => {
        if (cancelled) return;
        if (!row) return setFetched({ id, state: 'notfound' });
        if (row.owner_id !== user?.id) {
          if (row.is_public) navigate(`/s/${row.share_slug}`, { replace: true });
          else setFetched({ id, state: 'notfound' });
          return;
        }
        useDesign.getState().loadDesign(row.graph, {
          source: 'saved',
          title: row.title,
          savedId: row.id,
          shareSlug: row.share_slug,
          isPublic: row.is_public,
          ownerId: row.owner_id,
        });
        setFetched({ id, state: 'ready' });
      })
      .catch(() => !cancelled && setFetched({ id, state: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [id, authReady, user?.id, navigate]);

  // Autosave. saveVersion resets to 0 on load, so only real edits trigger a write; the
  // status shown is derived from which version last landed.
  useEffect(() => {
    if (!savedId || saveVersion === 0) return;
    const version = saveVersion;
    const t = setTimeout(async () => {
      const s = useDesign.getState();
      try {
        await updateDesign(savedId, { title: s.title, graph: s.design, review_score: s.review?.score ?? null });
        setSaveResult({ version, ok: true });
      } catch {
        setSaveResult({ version, ok: false });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [saveVersion, savedId]);

  const saveState: 'idle' | 'saving' | 'saved' | 'error' = creating
    ? 'saving'
    : !savedId || saveVersion === 0
      ? 'idle'
      : saveResult?.version === saveVersion
        ? saveResult.ok
          ? 'saved'
          : 'error'
        : 'saving';
  const fitKey = `${id ?? 'draft'}:${loadState}:${picks}`;

  const save = useCallback(async () => {
    if (savedId) return;
    if (!isSupabaseConfigured) return toast('Connect your Supabase project to save (see README). Your draft is kept in this browser.', 'warn', 5000);
    if (!user) return setSignInOpen(true);
    setCreating(true);
    try {
      const s = useDesign.getState();
      const row = await createDesign({ title: s.title, graph: s.design, review_score: s.review?.score ?? null });
      s.setMeta({ source: 'saved', savedId: row.id, shareSlug: row.share_slug, isPublic: row.is_public, ownerId: row.owner_id });
      toast('Saved to your designs', 'success');
      navigate(`/d/${row.id}`, { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setCreating(false);
    }
  }, [savedId, user, navigate]);

  const togglePublic = async () => {
    if (!savedId) return;
    const next = !isPublic;
    try {
      await updateDesign(savedId, { is_public: next });
      useDesign.getState().setMeta({ isPublic: next });
    } catch {
      toast('Could not update sharing', 'error');
    }
  };

  const shareUrl = shareSlug ? `${window.location.origin}/s/${shareSlug}` : '';

  if (loadState === 'loading') {
    return <EditorSkeleton />;
  }
  if (loadState !== 'ready') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">{loadState === 'notfound' ? 'Design not found' : 'Could not load this design'}</h1>
        <p className="max-w-sm text-sm text-muted">
          {loadState === 'notfound'
            ? user
              ? 'It may have been deleted, or it belongs to someone else and is private.'
              : 'Sign in to open your saved designs.'
            : isSupabaseConfigured
              ? 'Check your connection and try again.'
              : 'Saved designs need a Supabase project. See the README.'}
        </p>
        <div className="flex gap-2">
          {!user && isSupabaseConfigured && (
            <Link to={`/auth?next=/d/${id}`} className="btn-primary">
              Sign in
            </Link>
          )}
          <Link to="/play" className="btn">
            Open the editor
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Workspace
        fitKey={fitKey}
        onSave={save}
        headerLeft={
          <>
            <Brand />
            <div className="hidden xl:block">
              <NavLinks />
            </div>
            <span className="hidden h-5 w-px bg-line sm:block" />
            <input
              className="min-w-0 max-w-[260px] flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-line focus:border-ok/60 focus:outline-none"
              value={title}
              maxLength={120}
              aria-label="Design title"
              onChange={(e) => useDesign.getState().setTitle(e.target.value)}
            />
            <span className="hidden whitespace-nowrap text-xs text-muted sm:inline">
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && (
                <span className="inline-flex items-center gap-1 text-good">
                  <Check size={12} /> Saved
                </span>
              )}
              {saveState === 'error' && <span className="text-bad">Save failed</span>}
              {!savedId && saveState === 'idle' && 'Draft · this browser'}
            </span>
          </>
        }
        headerRight={
          <>
            {!savedId && (
              <button className="btn-icon" onClick={() => setPickerOpen(true)} aria-label="New from template" title="New from template">
                <FilePlus2 size={15} />
              </button>
            )}
            <button
              className="btn-icon hidden sm:inline-flex"
              onClick={() => exportCanvasPng(title).catch(() => toast('Export failed', 'error'))}
              aria-label="Export PNG"
              title="Export PNG"
            >
              <Download size={15} />
            </button>
            <button className="btn hidden sm:inline-flex" onClick={() => (savedId ? setShareOpen(true) : save())}>
              <Share2 size={14} /> Share
            </button>
            {!savedId && (
              <button className="btn-primary" onClick={save} title="⌘S">
                <Save size={14} /> <span className="hidden sm:inline">Save</span>
              </button>
            )}
            <div className="hidden sm:block">
              <div className="hidden sm:block">
            <UserMenu />
          </div>
            </div>
          </>
        }
      />

      <TemplatePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(design, t) => {
          useDesign.getState().loadDesign(design ?? EMPTY, { source: 'draft', title: t });
          setPickerOpen(false);
          setPicks((k) => k + 1);
        }}
      />

      <Modal open={signInOpen} onClose={() => setSignInOpen(false)} title="Sign in to save">
        <p className="text-sm text-muted">Your draft stays in this browser. Sign in to save it to your account, share it, and submit challenge scores.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setSignInOpen(false)}>
            Not now
          </button>
          <Link to="/auth?next=/play" className="btn-primary">
            Sign in
          </Link>
        </div>
      </Modal>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share design">
        <button role="switch" aria-checked={isPublic} onClick={togglePublic} className="flex w-full items-center justify-between rounded-md border border-line p-3 text-left">
          <span>
            <span className="block text-sm font-medium">Anyone with the link can view</span>
            <span className="block text-xs text-muted">They can run it, break it, and fork it. Only you can edit.</span>
          </span>
          <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${isPublic ? 'bg-ok/70' : 'bg-line'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-text transition-all ${isPublic ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </button>
        {isPublic && (
          <div className="mt-3 flex gap-2">
            <input className="input font-num text-xs" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <button
              className="btn shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
