import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Bot, Flame, ShieldCheck } from 'lucide-react';
import { SCENARIOS } from '@/core';
import { LiveDemo } from '@/components/LiveDemo';
import { ScenarioCard } from '@/components/ScenarioCard';

const FEATURES = [
  {
    icon: Activity,
    title: 'Simulate',
    body: 'A real queueing model, not an animation. Utilization, saturation latency, autoscaling, failover, circuit breakers and retry storms, with live p50/p95/p99.',
  },
  {
    icon: Flame,
    title: 'Break',
    body: 'Kill the database primary. Partition the network. Add 4 seconds to a third-party API. Send 10x traffic. Watch the blast radius spread in the incident log.',
  },
  {
    icon: ShieldCheck,
    title: 'Prove',
    body: 'Five scripted incidents with SLOs and a budget. Deterministic scoring, verified on the server, so the leaderboard means something.',
  },
  {
    icon: Bot,
    title: 'Explain',
    body: 'Ask why it failed. An open model runs on your own GPU, reads the simulator’s numbers and suggests the fix. No API key, and your design never leaves the browser.',
  },
];

export default function LandingPage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 lg:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
            Your architecture diagram, <span className="text-ok">but it runs.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Drag in servers, caches and queues. Press play. Then break things and watch what survives.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/play" className="btn-primary px-5 py-2.5 text-base">
              Start building <ArrowRight size={16} />
            </Link>
            <Link to="/challenges" className="btn px-5 py-2.5 text-base">
              Take a challenge
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">No signup to play. Runs entirely in your browser.</p>
        </div>
        <div className="mt-12">
          <LiveDemo />
        </div>
      </section>

      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-bg text-ok">
                <f.icon size={18} />
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ['Design', 'Start from a template or a blank canvas, or make your own components. Label links, bend them, add notes and zones, like any diagram tool.'],
            ['Run', 'Requests flow as particles. Every node shows utilization and latency; the review grades your design A to F.'],
            ['Break & prove', 'Inject failures by hand, or run a scripted challenge and submit a verified score.'],
          ].map(([title, body], i) => (
            <li key={title} className="panel p-5">
              <div className="font-num text-sm text-ok">0{i + 1}</div>
              <div className="mt-2 font-display text-lg font-semibold">{title}</div>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Can your design survive these?</h2>
          <Link to="/challenges" className="hidden text-sm text-ok hover:underline sm:block">
            All challenges →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => (
            <ScenarioCard key={s.id} scenario={s} />
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span>Deterministic simulation. On-device AI, no API key. Open source.</span>
          <span>Blast Radius</span>
        </div>
      </footer>
    </div>
  );
}
