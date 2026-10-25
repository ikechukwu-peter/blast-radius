import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from '@/stores/authStore';
import { SiteLayout } from '@/components/Layout';
import { EditorSkeleton, PageSkeleton } from '@/components/ui/Skeleton';
import { Toaster } from '@/components/ui/Toaster';
import AuthPage from '@/pages/AuthPage';
import ChallengesPage from '@/pages/ChallengesPage';
import LandingPage from '@/pages/LandingPage';
import NotFound from '@/pages/NotFound';

// Heavy routes (canvas editor, charts) load on demand so the landing page stays light.
const EditorPage = lazy(() => import('@/pages/EditorPage'));
const SharedPage = lazy(() => import('@/pages/SharedPage'));
const ChallengeRunPage = lazy(() => import('@/pages/ChallengeRunPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const MePage = lazy(() => import('@/pages/MePage'));



/** Full-height editor routes, with an editor-shaped skeleton while the chunk loads. */
function Screen({ children, readOnly = false }: { children: ReactNode; readOnly?: boolean }) {
  return (
    <div className="h-screen">
      <Suspense fallback={<EditorSkeleton readOnly={readOnly} />}>{children}</Suspense>
    </div>
  );
}

/** Remount the editor per design id so its local state never leaks between designs. */
function SavedEditor() {
  const { id } = useParams();
  return <EditorPage key={id} />;
}

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

export default function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => init(), [init]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/play" element={<Screen><EditorPage key="draft" /></Screen>} />
        <Route path="/d/:id" element={<Screen><SavedEditor /></Screen>} />
        <Route path="/s/:slug" element={<Screen readOnly><SharedPage /></Screen>} />
        <Route element={<SiteLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/challenges/:scenarioId" element={<Page><ChallengeRunPage /></Page>} />
          <Route path="/leaderboard" element={<Page><LeaderboardPage /></Page>} />
          <Route path="/me" element={<Page><MePage /></Page>} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
