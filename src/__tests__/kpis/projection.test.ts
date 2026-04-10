import { describe, it, expect } from 'vitest';
import type { KpiDefinition } from '../../types.js';
import type { SkynetEvent } from '../../skynet/types.js';
import type { PipelineDescriptor } from '../../kpis/types.js';
import { KpiProjection } from '../../kpis/projection.js';

const BASE_TIME = 1_000_000_000;

function makeDef(id = 'test_kpi'): KpiDefinition {
  return {
    id,
    name: 'Test KPI',
    category: 'flow',
    unit: 'count',
    description: 'A test KPI',
    data_source: 'run.ended',
  };
}

function makePipeline(overrides: Partial<PipelineDescriptor> = {}): PipelineDescriptor {
  return {
    version: 1,
    sources: [{ family: 'run.ended' }],
    aggregation: { type: 'count' },
    window: '1h',
    output_unit: 'count',
    ...overrides,
  };
}

function makeEvent(type: string, timestamp: number, payload: Record<string, unknown> = {}): SkynetEvent {
  return { type, timestamp, payload };
}

describe('KpiProjection', () => {
  it('ingests matching events and computes count', () => {
    const proj = new KpiProjection(makeDef(), makePipeline());
    proj.ingest(makeEvent('run.ended', BASE_TIME));
    proj.ingest(makeEvent('run.ended', BASE_TIME + 1000));

    const value = proj.compute(BASE_TIME + 2000);
    expect(value.id).toBe('test_kpi');
    expect(value.value).toBe(2);
    expect(value.freshness).toBe('live');
  });

  it('ignores events that do not match the family', () => {
    const proj = new KpiProjection(makeDef(), makePipeline());
    proj.ingest(makeEvent('usage.delta', BASE_TIME));

    const value = proj.compute(BASE_TIME + 1000);
    expect(value.value).toBe(0);
  });

  it('applies source filter', () => {
    const pipeline = makePipeline({
      sources: [{ family: 'run.ended', filter: { agent_id: 'scraper' } }],
    });
    const proj = new KpiProjection(makeDef(), pipeline);

    proj.ingest({
      ...makeEvent('run.ended', BASE_TIME),
      agent_id: 'scraper',
    });
    proj.ingest({
      ...makeEvent('run.ended', BASE_TIME + 100),
      agent_id: 'other',
    });

    const value = proj.compute(BASE_TIME + 200);
    expect(value.value).toBe(1);
  });

  it('prefers payload fields before top-level fields when both exist', () => {
    const pipeline = makePipeline({
      sources: [{ family: 'system.event', filter: { type: 'task_assigned' } }],
    });
    const proj = new KpiProjection(makeDef(), pipeline);

    proj.ingest(makeEvent('system.event', BASE_TIME, { type: 'task_assigned' }));

    const value = proj.compute(BASE_TIME + 100);
    expect(value.value).toBe(1);
  });

  it('freshness is "mock" when no events received', () => {
    const proj = new KpiProjection(makeDef(), makePipeline());
    const value = proj.compute(BASE_TIME);
    expect(value.freshness).toBe('mock');
  });

  it('freshness is "stale" when events existed but window is empty', () => {
    const proj = new KpiProjection(makeDef(), makePipeline());
    proj.ingest(makeEvent('run.ended', BASE_TIME));

    // Compute way after the window
    const value = proj.compute(BASE_TIME + 4_000_000);
    expect(value.freshness).toBe('stale');
  });

  it('computes delta between successive calls', () => {
    const proj = new KpiProjection(makeDef(), makePipeline());

    // First compute — no delta (no previous)
    proj.ingest(makeEvent('run.ended', BASE_TIME));
    const v1 = proj.compute(BASE_TIME + 100);
    expect(v1.value).toBe(1);
    expect(v1.delta).toBeUndefined();

    // Add more events, compute again — delta should be +2
    proj.ingest(makeEvent('run.ended', BASE_TIME + 200));
    proj.ingest(makeEvent('run.ended', BASE_TIME + 300));
    const v2 = proj.compute(BASE_TIME + 400);
    expect(v2.value).toBe(3);
    expect(v2.delta).toBe(2);
  });

  it('builds trend from recent values', () => {
    const proj = new KpiProjection(makeDef(), makePipeline());

    // Compute multiple times, adding events each round
    for (let i = 0; i < 3; i++) {
      proj.ingest(makeEvent('run.ended', BASE_TIME + i * 100));
      proj.compute(BASE_TIME + i * 100 + 50);
    }

    const v = proj.compute(BASE_TIME + 400);
    // trend should be the linear regression slope (a number)
    expect(v.trend).toBeDefined();
    expect(typeof v.trend).toBe('number');
  });

  it('source is set correctly', () => {
    const proj = new KpiProjection(makeDef(), makePipeline());
    const value = proj.compute(BASE_TIME);
    expect(value.source).toBe('projection:run.ended');
  });
});
