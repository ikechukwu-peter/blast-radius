import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { Simulation, validateDesign, type ChaosAction, type Design, type SimEvent, type TickResult } from '@/core';
import { COLORS } from '@/lib/kinds';

/**
 * Drives a Simulation on requestAnimationFrame. A factory, not a singleton: the editor,
 * the landing-page demo and challenge runs each own an independent store.
 */

export interface HistoryPoint {
  t: number;
  p50: number;
  p95: number;
  p99: number;
  errorPct: number;
  rps: number;
}

export interface ActiveChaos {
  key: string;
  label: string;
  level: 'warn' | 'critical';
  undo: ChaosAction;
}

export interface TimelineItem {
  atSec: number;
  actions: ChaosAction[];
  caption: string;
}

export interface PlayOptions {
  seed?: number;
  samplesPerTick?: number;
  warmupTicks?: number;
  timeline?: TimelineItem[];
  durationSec?: number;
  speed?: number;
  onCaption?: (caption: string) => void;
  onFinish?: () => void;
}

export type SimStatus = 'stopped' | 'running' | 'paused' | 'finished';

export interface SimState {
  status: SimStatus;
  speed: number;
  tick: TickResult | null;
  /** Simulated seconds since play (after warm-up). */
  elapsed: number;
  duration: number | null;
  history: HistoryPoint[];
  events: SimEvent[];
  trafficMultiplier: number;
  activeChaos: ActiveChaos[];
  pulses: Record<string, { at: number; color: string }>;
  play(design: Design, opts?: PlayOptions): boolean;
  pause(): void;
  resume(): void;
  reset(): void;
  setSpeed(speed: number): void;
  apply(action: ChaosAction): void;
}

export type SimStore = StoreApi<SimState>;

const DT = 0.1;
const HISTORY_SECONDS = 120;
const MAX_EVENTS = 200;
const PUBLISH_MS = 100;

export function createSimStore(): SimStore {
  let sim: Simulation | null = null;
  let design: Design | null = null;
  let options: PlayOptions = {};
  let raf = 0;
  let lastNow = 0;
  let acc = 0;
  let lastPublish = 0;
  let lastHistorySec = -1;
  let elapsed = 0;
  let pending: TimelineItem[] = [];
  let history: HistoryPoint[] = [];
  let pendingEvents: SimEvent[] = [];
  let latest: TickResult | null = null;
  const edgeLatency = new Map<string, number>();

  const store = createStore<SimState>((set, get) => {
    const nodeLabel = (id: string) => design?.nodes.find((n) => n.id === id)?.label ?? id;
    const edgeLabel = (id: string) => {
      const e = design?.edges.find((x) => x.id === id);
      return e ? `${nodeLabel(e.source)} → ${nodeLabel(e.target)}` : id;
    };

    const pulse = (id: string, color: string) =>
      set({ pulses: { ...get().pulses, [id]: { at: performance.now(), color } } });

    const upsertChaos = (entry: ActiveChaos) =>
      set({ activeChaos: [...get().activeChaos.filter((c) => c.key !== entry.key), entry] });
    const dropChaos = (key: string) => set({ activeChaos: get().activeChaos.filter((c) => c.key !== key) });

    const applyInternal = (action: ChaosAction) => {
      if (!sim) return;
      sim.apply(action);
      switch (action.type) {
        case 'kill_instance':
          upsertChaos({ key: `n:${action.nodeId}`, label: `${nodeLabel(action.nodeId)}: instance killed`, level: 'critical', undo: { type: 'recover', nodeId: action.nodeId } });
          pulse(action.nodeId, COLORS.bad);
          break;
        case 'outage':
          upsertChaos({ key: `n:${action.nodeId}`, label: `${nodeLabel(action.nodeId)}: DOWN`, level: 'critical', undo: { type: 'recover', nodeId: action.nodeId } });
          pulse(action.nodeId, COLORS.bad);
          break;
        case 'degrade':
          upsertChaos({ key: `n:${action.nodeId}`, label: `${nodeLabel(action.nodeId)}: degraded`, level: 'warn', undo: { type: 'recover', nodeId: action.nodeId } });
          pulse(action.nodeId, COLORS.warn);
          break;
        case 'recover':
          dropChaos(`n:${action.nodeId}`);
          pulse(action.nodeId, COLORS.good);
          break;
        case 'add_latency': {
          const total = (edgeLatency.get(action.edgeId) ?? 0) + action.ms;
          edgeLatency.set(action.edgeId, total);
          upsertChaos({ key: `e:${action.edgeId}`, label: `${edgeLabel(action.edgeId)}: +${total}ms`, level: 'warn', undo: { type: 'heal', edgeId: action.edgeId } });
          pulse(action.edgeId, COLORS.warn);
          break;
        }
        case 'partition':
          upsertChaos({ key: `e:${action.edgeId}`, label: `${edgeLabel(action.edgeId)}: partitioned`, level: 'critical', undo: { type: 'heal', edgeId: action.edgeId } });
          pulse(action.edgeId, COLORS.bad);
          break;
        case 'heal':
          edgeLatency.delete(action.edgeId);
          dropChaos(`e:${action.edgeId}`);
          break;
        case 'traffic':
          set({ trafficMultiplier: action.multiplier });
          if (action.multiplier === 1) dropChaos('traffic');
          else upsertChaos({ key: 'traffic', label: `Traffic ${action.multiplier}x`, level: action.multiplier > 1 ? 'warn' : 'warn', undo: { type: 'traffic', multiplier: 1 } });
          break;
        case 'recover_all':
          edgeLatency.clear();
          set({ activeChaos: [], trafficMultiplier: 1 });
          break;
      }
    };

    const publish = (now: number) => {
      const events = pendingEvents.length ? [...pendingEvents.reverse(), ...get().events].slice(0, MAX_EVENTS) : get().events;
      pendingEvents = [];
      lastPublish = now;
      set({ tick: latest, elapsed, history: [...history], events });
    };

    const frame = (now: number) => {
      if (get().status !== 'running' || !sim) return;
      const realDt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      acc += realDt * get().speed;
      let steps = 0;
      let finished = false;
      while (acc >= DT && steps < 40) {
        elapsed = Math.round((elapsed + DT) * 10) / 10;
        while (pending.length && pending[0].atSec <= elapsed + 1e-9) {
          const item = pending.shift()!;
          item.actions.forEach(applyInternal);
          options.onCaption?.(item.caption);
        }
        latest = sim.step(DT);
        pendingEvents.push(...latest.events);
        acc -= DT;
        steps++;
        const sec = Math.floor(elapsed);
        if (sec > lastHistorySec) {
          lastHistorySec = sec;
          const m = latest.metrics;
          history.push({ t: sec, p50: m.p50Ms, p95: m.p95Ms, p99: m.p99Ms, errorPct: m.errorRate * 100, rps: m.throughputRps });
          if (history.length > HISTORY_SECONDS) history.shift();
        }
        const duration = get().duration;
        if (duration !== null && elapsed >= duration) {
          finished = true;
          break;
        }
      }
      if (finished) {
        publish(now);
        set({ status: 'finished' });
        options.onFinish?.();
        return;
      }
      if (now - lastPublish >= PUBLISH_MS) publish(now);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      lastNow = performance.now();
      raf = requestAnimationFrame(frame);
    };

    return {
      status: 'stopped',
      speed: 1,
      tick: null,
      elapsed: 0,
      duration: null,
      history: [],
      events: [],
      trafficMultiplier: 1,
      activeChaos: [],
      pulses: {},

      play(d, opts = {}) {
        if (validateDesign(d).length) return false;
        cancelAnimationFrame(raf);
        design = d;
        options = opts;
        sim = new Simulation(d, { seed: opts.seed ?? 42, samplesPerTick: opts.samplesPerTick });
        for (let i = 0; i < (opts.warmupTicks ?? 0); i++) sim.step(DT);
        acc = 0;
        elapsed = 0;
        lastHistorySec = -1;
        history = [];
        pendingEvents = [];
        latest = null;
        edgeLatency.clear();
        pending = [...(opts.timeline ?? [])].sort((a, b) => a.atSec - b.atSec);
        set({
          status: 'running',
          speed: opts.speed ?? get().speed,
          tick: null,
          elapsed: 0,
          duration: opts.durationSec ?? null,
          history: [],
          events: [],
          trafficMultiplier: 1,
          activeChaos: [],
          pulses: {},
        });
        start();
        return true;
      },
      pause() {
        if (get().status !== 'running') return;
        cancelAnimationFrame(raf);
        set({ status: 'paused' });
      },
      resume() {
        if (get().status !== 'paused') return;
        set({ status: 'running' });
        start();
      },
      reset() {
        cancelAnimationFrame(raf);
        sim = null;
        design = null;
        pending = [];
        history = [];
        latest = null;
        edgeLatency.clear();
        set({ status: 'stopped', tick: null, elapsed: 0, duration: null, history: [], events: [], trafficMultiplier: 1, activeChaos: [], pulses: {} });
      },
      setSpeed(speed) {
        set({ speed });
      },
      apply(action) {
        if (!sim) return;
        applyInternal(action);
        // Surface the engine's event immediately even when paused.
        if (get().status === 'paused') {
          latest = sim.step(0.0001);
          pendingEvents.push(...latest.events);
          publish(performance.now());
        }
      },
    };
  });

  return store;
}

/** The editor's simulation. */
export const editorSim = createSimStore();

const idleStore = createSimStore();
export const LiveContext = createContext<SimStore>(idleStore);

/** Subscribe to the nearest simulation store. Selectors must return stable values (primitives or existing refs). */
export function useLive<T>(selector: (s: SimState) => T): T {
  return useStore(useContext(LiveContext), selector);
}

export function useSim<T>(store: SimStore, selector: (s: SimState) => T): T {
  return useStore(store, selector);
}
