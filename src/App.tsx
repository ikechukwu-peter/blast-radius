import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/stores/authStore';
import { SiteLayout } from '@/components/Layout';
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

function Loading() {
  return <div className="flex h-[60vh] items-center justify-center text-sm text-muted">Loading…</div>;
}

export default function App() {
  const init = useAuth((s) => s.init);
  useEffect(() => init(), [init]);

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/play" element={<div className="h-screen"><EditorPage /></div>} />
        <Route path="/d/:id" element={<div className="h-screen"><EditorPage /></div>} />
        <Route path="/s/:slug" element={<div className="h-screen"><SharedPage /></div>} />
        <Route element={<SiteLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/challenges" element={<ChallengesPage />} />
          <Route path="/challenges/:scenarioId" element={<ChallengeRunPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}
