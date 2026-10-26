// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Simulation, TEMPLATES, reviewDesign, validateDesign } from '@/core';
import { CLOUD_SERVICES, cloudIconUrl, cloudService } from '@/lib/cloudCatalog';
import { ALL_TEMPLATES, CLOUD_TEMPLATES } from '@/lib/cloudTemplates';
import { useDesign } from '@/stores/designStore';

const s = () => useDesign.getState();

describe('cloud catalog', () => {
  it('ships an official icon file for every service', () => {
    for (const svc of CLOUD_SERVICES) {
      const url = cloudIconUrl(`cloud:${svc.id}`)!;
      expect(url, svc.id).toMatch(new RegExp(`^/cloud/${svc.provider}/`));
      expect(existsSync(path.join('public', url)), url).toBe(true);
    }
  });

  it('has unique ids and the full product name for each icon', () => {
    expect(new Set(CLOUD_SERVICES.map((c) => c.id)).size).toBe(CLOUD_SERVICES.length);
    for (const svc of CLOUD_SERVICES) expect(svc.name.length).toBeGreaterThanOrEqual(svc.short.length);
  });

  it('ignores icons that are not cloud icons', () => {
    expect(cloudIconUrl('database')).toBeUndefined();
    expect(cloudIconUrl(undefined)).toBeUndefined();
  });
});

describe('cloud templates', () => {
  it('are offered after the core templates', () => {
    expect(ALL_TEMPLATES.slice(0, TEMPLATES.length)).toEqual(TEMPLATES);
    expect(ALL_TEMPLATES.map((t) => t.id)).toContain('aws-data-platform');
  });

  it.each(CLOUD_TEMPLATES.map((t) => [t.id, t] as const))('%s is valid, uses official icons and runs healthy', (_, t) => {
    expect(validateDesign(t.design)).toEqual([]);
    for (const n of t.design.nodes) {
      const icon = n.appearance?.icon;
      if (icon?.startsWith('cloud:')) expect(cloudService(icon.slice(6)), icon).toBeDefined();
    }
    expect(t.design.annotations?.filter((a) => a.type === 'stage')).toHaveLength(5);
    const sim = new Simulation(t.design, { seed: 3 });
    let tick = sim.step();
    for (let i = 0; i < 60; i++) tick = sim.step();
    expect(tick.metrics.errorRate).toBeLessThan(0.01);
    expect(['A', 'B']).toContain(reviewDesign(t.design).grade);
  });
});

describe('stage columns', () => {
  beforeEach(() => {
    localStorage.clear();
    s().loadDesign({ version: 1, nodes: [], edges: [] }, { source: 'draft' });
  });

  it('names new stages along the pipeline', () => {
    s().addAnnotation('stage');
    s().addAnnotation('stage');
    expect(s().design.annotations!.map((a) => a.text)).toEqual(['Ingestion', 'Data Lake']);
  });

  it('centres a component dropped in a column, and leaves others alone', () => {
    const stage = s().addAnnotation('stage', { x: 0, y: 0 });
    const width = s().design.annotations!.find((a) => a.id === stage)!.width;
    const inside = s().addFromCloud(cloudService('aws-s3')!, { x: 5, y: 100 });
    const outside = s().addFromCloud(cloudService('aws-glue')!, { x: 900, y: 100 });
    s().snapToStages([inside, outside]);
    const pos = (id: string) => s().design.nodes.find((n) => n.id === id)!.position!;
    expect(pos(inside).x).toBe(Math.round((width - 176) / 2));
    expect(pos(outside).x).toBe(900);
  });

  it('labels a cloud component with its short name and keeps the full product name', () => {
    const id = s().addFromCloud(cloudService('aws-s3')!);
    const n = s().design.nodes.find((x) => x.id === id)!;
    expect(n.label).toBe('S3');
    expect(n.appearance).toMatchObject({ typeLabel: 'Amazon Simple Storage Service (S3)', icon: 'cloud:aws-s3' });
  });
});
