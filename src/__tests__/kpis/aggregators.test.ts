import { describe, it, expect } from 'vitest';
import type { SkynetEvent } from '../../skynet/types.js';
import type { AggregationType } from '../../kpis/types.js';
import { aggregate } from '../../kpis/aggregators.js';

function makeEvent(payload: Record<string, unknown> = {}): SkynetEvent {
  return { type: 'run.ended', timestamp: Date.now(), payload };
}

describe('aggregate', () => {
  it('count — counts all events', () => {
    const events = [makeEvent(), makeEvent(), makeEvent()];
    expect(aggregate(events, { type: 'count' })).toBe(3);
  });

  it('count — returns 0 for empty', () => {
    expect(aggregate([], { type: 'count' })).toBe(0);
  });

  it('count_where — counts events matching predicate', () => {
    const events = [
      makeEvent({ success: 'true' }),
      makeEvent({ success: 'false' }),
      makeEvent({ success: 'true' }),
    ];
    const config: AggregationType = {
      type: 'count_where',
      predicate: { success: 'true' },
    };
    expect(aggregate(events, config)).toBe(2);
  });

  it('count_where — falls back to top-level telemetry fields', () => {
    const events = [
      { ...makeEvent(), agent_id: 'agent-1' },
      { ...makeEvent(), agent_id: 'agent-2' },
      { ...makeEvent(), agent_id: 'agent-1' },
    ];
    const config: AggregationType = {
      type: 'count_where',
      predicate: { agent_id: 'agent-1' },
    };
    expect(aggregate(events, config)).toBe(2);
  });

  it('avg — computes mean of a numeric field', () => {
    const events = [
      makeEvent({ latency: 100 }),
      makeEvent({ latency: 200 }),
      makeEvent({ latency: 300 }),
    ];
    expect(aggregate(events, { type: 'avg', field: 'latency' })).toBe(200);
  });

  it('avg — returns 0 for empty events', () => {
    expect(aggregate([], { type: 'avg', field: 'latency' })).toBe(0);
  });

  it('sum — sums a numeric field', () => {
    const events = [
      makeEvent({ cost: 10 }),
      makeEvent({ cost: 20 }),
      makeEvent({ cost: 30 }),
    ];
    expect(aggregate(events, { type: 'sum', field: 'cost' })).toBe(60);
  });

  it('p50 — computes 50th percentile', () => {
    const events = [
      makeEvent({ duration: 10 }),
      makeEvent({ duration: 20 }),
      makeEvent({ duration: 30 }),
      makeEvent({ duration: 40 }),
    ];
    expect(aggregate(events, { type: 'p50', field: 'duration' })).toBe(20);
  });

  it('p90 — computes 90th percentile', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ duration: (i + 1) * 10 }),
    );
    // 10 events: p90 = 90th percentile → index ceil(0.9 * 10) - 1 = 8 → value 90
    expect(aggregate(events, { type: 'p90', field: 'duration' })).toBe(90);
  });

  it('max — finds maximum', () => {
    const events = [
      makeEvent({ score: 5 }),
      makeEvent({ score: 99 }),
      makeEvent({ score: 42 }),
    ];
    expect(aggregate(events, { type: 'max', field: 'score' })).toBe(99);
  });

  it('min — finds minimum', () => {
    const events = [
      makeEvent({ score: 5 }),
      makeEvent({ score: 99 }),
      makeEvent({ score: 42 }),
    ];
    expect(aggregate(events, { type: 'min', field: 'score' })).toBe(5);
  });

  it('rate — computes numerator / denominator', () => {
    const events = [
      makeEvent({ success: 'true' }),
      makeEvent({ success: 'true' }),
      makeEvent({ success: 'false' }),
    ];
    const config: AggregationType = {
      type: 'rate',
      numerator: { type: 'count_where', predicate: { success: 'true' } },
      denominator: { type: 'count' },
    };
    expect(aggregate(events, config)).toBeCloseTo(2 / 3);
  });

  it('rate — returns 0 when denominator is 0', () => {
    const config: AggregationType = {
      type: 'rate',
      numerator: { type: 'count' },
      denominator: { type: 'count' },
    };
    expect(aggregate([], config)).toBe(0);
  });

  it('handles nested payload fields', () => {
    const events = [
      makeEvent({ metrics: { cpu: 80 } }),
      makeEvent({ metrics: { cpu: 60 } }),
    ];
    expect(aggregate(events, { type: 'avg', field: 'metrics.cpu' })).toBe(70);
  });
});
