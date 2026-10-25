import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Copy, Globe, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { createDesign, deleteDesign, listMyDesigns, updateDesign, type DesignRow } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { COLORS } from '@/lib/kinds';
import { isSupabaseConfigured } from '@/lib/supabase';
import { displayName, useAuth } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { Modal } from '@/components/ui/Modal';

function gradeFor(score: number | null) {
  if (score === null) return null;
  const g = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
  const c = g === 'A' ? COLORS.good : g === 'B' ? COLORS.ok : g === 'F' ? COLORS.bad : COLORS.warn;
  return { g, c };
}

export default function MePage() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const [rows, setRows] = useState<DesignRow[] | null>(null);
  const [renaming, setRenaming] = useState<DesignRow | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [deleting, setDeleting] = useState<DesignRow | null>(null);

  useEffect(() => {
    if (!user) return;
    listMyDesigns(user.id)
      .then(setRows)
      .catch(() => {
        setRows([]);
        toast('Could not load your designs', 'error');
      });
  }, [user]);

  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-muted">
        Saved designs need a Supabase project (see README). Your current draft lives in this browser:{' '}
        <Link className="text-ok underline" to="/play">
          open the editor
        </Link>
        .
      </div>
    );
  }
  if (ready && !user) return <Navigate to="/auth?next=/me" replace />;

  const duplicate = async (r: DesignRow) => {
    try {
      const copy = await createDesign({ title: `${r.title} (copy)`.slice(0, 120), graph: r.graph, review_score: r.review_score });
      setRows((rs) => [copy, ...(rs ?? [])]);
    } catch {
      toast('Could not duplicate', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My designs</h1>
          <p className="mt-1 text-sm text-muted">{user ? `Signed in as ${displayName(user)}` : ''}</p>
        </div>
        <Link to="/play" className="btn-primary">
          <Plus size={15} /> New design
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows === null &&
          Array.from({ length: 3 }, (_, i) => <div key={i} className="panel h-36 animate-pulse bg-panel2/40" />)}
        {rows?.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-line p-10 text-center text-muted">
            No saved designs yet.{' '}
            <Link to="/play" className="text-ok underline">
              Build one
            </Link>{' '}
            and press Save.
          </div>
        )}
        {rows?.map((r) => {
          const grade = gradeFor(r.review_score);
          return (
            <div key={r.id} className="panel flex flex-col p-4 transition-colors hover:border-muted/50">
              <Link to={`/d/${r.id}`} className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display text-base font-semibold">{r.title}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {r.graph.nodes.length} components · updated {fmtDate(r.updated_at)}
                    </div>
                  </div>
                  {grade && (
                    <span className="font-display text-2xl font-bold" style={{ color: grade.c }}>
                      {grade.g}
                    </span>
                  )}
                </div>
              </Link>
              <div className="mt-4 flex items-center justify-between">
                <span className={`chip ${r.is_public ? 'bg-ok/15 text-ok' : 'bg-panel2 text-muted'}`}>
                  {r.is_public ? <Globe size={10} /> : <Lock size={10} />} {r.is_public ? 'Public' : 'Private'}
                </span>
                <div className="flex gap-1">
                  <button
                    className="btn-icon h-7 w-7"
                    aria-label="Rename"
                    onClick={() => {
                      setRenaming(r);
                      setNewTitle(r.title);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button className="btn-icon h-7 w-7" aria-label="Duplicate" onClick={() => duplicate(r)}>
                    <Copy size={13} />
                  </button>
                  <button className="btn-icon h-7 w-7 text-bad" aria-label="Delete" onClick={() => setDeleting(r)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename design">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!renaming) return;
            try {
              await updateDesign(renaming.id, { title: newTitle.trim() || 'Untitled design' });
              setRows((rs) => rs?.map((x) => (x.id === renaming.id ? { ...x, title: newTitle.trim() || 'Untitled design' } : x)) ?? null);
              setRenaming(null);
            } catch {
              toast('Rename failed', 'error');
            }
          }}
        >
          <input className="input" autoFocus value={newTitle} maxLength={120} onChange={(e) => setNewTitle(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete design?">
        <p className="text-sm text-muted">
          <span className="font-semibold text-text">{deleting?.title}</span> will be permanently deleted. Leaderboard entries stay, but will no longer link to it.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            className="btn border-bad/50 text-bad hover:bg-bad/10"
            onClick={async () => {
              if (!deleting) return;
              try {
                await deleteDesign(deleting.id);
                setRows((rs) => rs?.filter((x) => x.id !== deleting.id) ?? null);
                setDeleting(null);
              } catch {
                toast('Delete failed', 'error');
              }
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
