import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Shapes } from 'lucide-react';
import { displayName, useAuth } from '@/stores/authStore';
import { LogoMark } from '@/components/ui/Logo';

export function Brand() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 font-display text-[15px] font-bold tracking-tight text-text">
      <LogoMark /> <span className="hidden sm:inline">Blast Radius</span>
    </Link>
  );
}

export function UserMenu() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) {
    return (
      <Link to="/auth" className="btn">
        Sign in
      </Link>
    );
  }
  const name = displayName(user);
  const avatar = user.user_metadata?.avatar_url as string | undefined;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-line bg-panel2 text-xs font-semibold" aria-label="Account menu">
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="panel absolute right-0 top-full z-50 mt-2 w-48 py-1 shadow-2xl">
          <div className="truncate px-3 py-2 text-xs text-muted">{name}</div>
          <Link to="/me" className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-panel2" onClick={() => setOpen(false)}>
            <Shapes size={14} /> My designs
          </Link>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-panel2"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function NavLinks() {
  const cls = ({ isActive }: { isActive: boolean }) => `rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'text-text' : 'text-muted hover:text-text'}`;
  return (
    <nav className="flex items-center gap-0.5">
      <NavLink to="/play" className={cls}>
        Play
      </NavLink>
      <NavLink to="/challenges" className={cls}>
        Challenges
      </NavLink>
      <NavLink to="/leaderboard" className={cls}>
        Leaderboard
      </NavLink>
    </nav>
  );
}

/** Layout for scrolling pages. Editor routes render their own chrome. */
export function SiteLayout() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Brand />
          <div className="flex items-center gap-2">
            <NavLinks />
            <UserMenu />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
