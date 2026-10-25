/** Placeholder shapes that mirror the real layout, so content doesn't jump when it arrives. */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-panel2 ${className}`} />;
}

function GhostNode({ x, y }: { x: string; y: string }) {
  return (
    <div className="absolute w-[176px] rounded-lg border border-line bg-panel p-3" style={{ left: x, top: y }}>
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2 w-14" />
        </div>
      </div>
    </div>
  );
}

/** Full-screen editor shape: header, palette, canvas with ghost nodes, side panel, sim bar. */
export function EditorSkeleton({ readOnly = false }: { readOnly?: boolean }) {
  return (
    <div className="flex h-full flex-col" role="status" aria-label="Loading editor">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="ml-2 h-4 w-40" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {!readOnly && (
          <div className="hidden w-56 shrink-0 space-y-2 border-r border-line bg-panel p-3 md:block">
            <Skeleton className="mb-3 h-3 w-24" />
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-[52px] w-full" />
            ))}
          </div>
        )}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <GhostNode x="12%" y="42%" />
          <GhostNode x="36%" y="42%" />
          <GhostNode x="60%" y="28%" />
          <GhostNode x="60%" y="56%" />
        </div>
        <div className="hidden w-80 shrink-0 space-y-3 border-l border-line bg-panel p-4 lg:block">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="flex h-14 shrink-0 items-center gap-3 border-t border-line bg-panel px-3">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-24" />
        <div className="ml-auto flex gap-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2 w-12" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Generic content page: title, intro, a grid of cards. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12" role="status" aria-label="Loading page">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-2/3 max-w-xl" />
      <Skeleton className="mt-4 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-2 h-4 w-3/4 max-w-xl" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="panel space-y-3 p-5">
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-3 w-5/6" />
      <div className="flex gap-1.5 pt-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mt-6 space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-md border border-line px-3 py-3">
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-12" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="hidden h-4 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function ReviewSkeleton() {
  return (
    <div className="space-y-4 p-4" role="status" aria-label="Reviewing design">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-12" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2 rounded-md border border-line p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
