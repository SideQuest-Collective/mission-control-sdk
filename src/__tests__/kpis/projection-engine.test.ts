import { describe, it, expect, vi, afterEach } from 'vitest';
import type { KpiDefinition } from '../../types.js';
import type { SkynetEvent } from '../../skynet/types.js';
import { TELEMETRY_FAMILIES, type PipelineDescriptor } from '../../kpis/types.js';
import { KpiProjectionEngine } from '../../kpis/projection-engine.js';

const BASE_TIME = 1_000_000_000;

function makeDef(id: string): KpiDefinition {
  return {
    id,
    name: `KPI ${id}`,
    category: 'flow',
    unit: 'count',
    description: `Test KPI ${id}`,
    data_source: 'run.ended',
  };
}

function makePipeline(family = 'run.ended' as const): PipelineDescriptor {
  return {
    version: 1,
    sources: [{ family }],
    aggregation: { type: 'count' },
    window: '1h',
    output_unit: 'count',
  };
}

function makeEvent(type: string, timestamp: number, payload: Record<string, unknown> = {}): SkynetEvent {
  return { type, timestamp, payload };
}

function mockSubscriber() {
  const handlers = new Map<string, Set<(e: SkynetEvent) => void>>();
  return {
    subscribe(eventType: string, cb: (e: SkynetEvent) => void) {
      let set = handlers.get(eventType);
      if (!set) {
        set = new Set();
        handlers.set(eventType, set);
      }
      set.add(cb);
    },
    unsubscribe(eventType: string) {
      handlers.delete(eventType);
    },
    destroy() {
      handlers.clear();
    },
    emit(event: SkynetEvent) {
      const cbs = handlers.get(event.type);
      if (cbs) {
        for (const cb of cbs) cb(event);
      }
    },
    handlers,
  };
}

describe('KpiProjectionEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('register and unregister projections', () => {
    const engine = new KpiProjectionEngine();
    engine.register(makeDef('kpi_a'), makePipeline());
    engine.register(makeDef('kpi_b'), makePipeline());
    expect(engine.size).toBe(2);

    engine.unregister('kpi_a');
    expect(engine.size).toBe(1);
    expect(engine.compute('kpi_a')).toBeNull();
  });

  it('ingest fans out to all projections', () => {
    const engine = new KpiProjectionEngine();
    engine.register(makeDef('kpi_a'), makePipeline());
    engine.register(makeDef('kpi_b'), makePipeline());

    engine.ingest(makeEvent('run.ended', BASE_TIME));

    const results = engine.computeAll(BASE_TIME + 100);
    expect(results.get('kpi_a')!.value).toBe(1);
    expect(results.get('kpi_b')!.value).toBe(1);
  });

  it('computeAll returns results for all projections', () => {
    const engine = new KpiProjectionEngine();
    engine.register(makeDef('kpi_a'), makePipeline());
    engine.register(makeDef('kpi_b'), makePipeline('system.event'));

    engine.ingest(makeEvent('run.ended', BASE_TIME));
    engine.ingest(makeEvent('system.event', BASE_TIME + 100));

    const results = engine.computeAll(BASE_TIME + 200);
    expect(results.size).toBe(2);
    expect(results.get('kpi_a')!.value).toBe(1);
    expect(results.get('kpi_b')!.value).toBe(1);
  });

  it('compute returns null for unknown KPI', () => {
    const engine = new KpiProjectionEngine();
    expect(engine.compute('nonexistent')).toBeNull();
  });

  it('start subscribes to telemetry and stop cleans up', () => {
    const engine = new KpiProjectionEngine(60_000);
    engine.register(makeDef('kpi_a'), makePipeline());

    const sub = mockSubscriber();
    engine.start(sub as any);
    expect(engine.running).toBe(true);

    expect(Array.from(sub.handlers.keys()).sort()).toEqual([...TELEMETRY_FAMILIES].sort());

    engine.stop();
    expect(engine.running).toBe(false);
    expect(sub.handlers.size).toBe(0);
  });

  it('receives events via subscriber and routes to projections', () => {
    const engine = new KpiProjectionEngine(60_000);
    engine.register(makeDef('kpi_a'), makePipeline());

    const sub = mockSubscriber();
    engine.start(sub as any);

    // Simulate an incoming event via the subscriber
    sub.emit(makeEvent('run.ended', BASE_TIME));

    const value = engine.compute('kpi_a', BASE_TIME + 100);
    expect(value!.value).toBe(1);

    engine.stop();
  });

  it('receives events from extended telemetry families', () => {
    const engine = new KpiProjectionEngine(60_000);
    engine.register(makeDef('kpi_a'), makePipeline('cost.billed'));

    const sub = mockSubscriber();
    engine.start(sub as any);

    sub.emit(makeEvent('cost.billed', BASE_TIME, { billed_cost_usd: 1.25 }));

    const value = engine.compute('kpi_a', BASE_TIME + 100);
    expect(value!.value).toBe(1);

    engine.stop();
  });
});
