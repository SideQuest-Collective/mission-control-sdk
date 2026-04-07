import type { KpiDefinition, KpiValue } from '../types.js';
import type { SkynetEvent } from '../skynet/types.js';
import type { PipelineDescriptor } from './types.js';
import { resolveEventPath } from './event-paths.js';
import { SlidingWindow } from './sliding-window.js';
import { aggregate } from './aggregators.js';

const TREND_HISTORY_SIZE = 5;

/**
 * Single KPI projection — ingests telemetry events, applies filtering and aggregation
 * over a sliding window, and produces a KpiValue.
 */
export class KpiProjection {
  readonly kpiId: string;
  private readonly definition: KpiDefinition;
  private readonly pipeline: PipelineDescriptor;
  private readonly window: SlidingWindow<SkynetEvent>;
  private readonly sourceFamily: string;
  private readonly sourceFilter: Record<string, string> | undefined;
  private previousValue: number | null = null;
  private recentValues: number[] = [];
  private hasReceivedEvents = false;

  constructor(definition: KpiDefinition, pipeline: PipelineDescriptor) {
    this.kpiId = definition.id;
    this.definition = definition;
    this.pipeline = pipeline;
    this.window = new SlidingWindow<SkynetEvent>(pipeline.window);
    this.sourceFamily = pipeline.sources[0].family;
    this.sourceFilter = pipeline.sources[0].filter;
  }

  /** Check whether an event matches this projection's source family and filter. */
  private matches(event: SkynetEvent): boolean {
    if (event.type !== this.sourceFamily) return false;
    if (!this.sourceFilter) return true;
    for (const [key, expected] of Object.entries(this.sourceFilter)) {
      const current = resolveEventPath(event, key);
      if (String(current) !== expected) return false;
    }
    return true;
  }

  /** Ingest an event — adds to window if it matches the pipeline filter. */
  ingest(event: SkynetEvent): void {
    if (this.matches(event)) {
      this.window.push(event, event.timestamp);
      this.hasReceivedEvents = true;
    }
  }

  /** Compute the current KPI value from the sliding window. */
  compute(now: number = Date.now()): KpiValue {
    this.window.evict(now);
    const events = this.window.entries().map((e) => e.data);
    const value = aggregate(events, this.pipeline.aggregation);

    // Delta
    const delta = this.previousValue !== null ? value - this.previousValue : undefined;
    this.previousValue = value;

    // Trend — keep last N values, compute simple linear regression slope
    this.recentValues.push(value);
    if (this.recentValues.length > TREND_HISTORY_SIZE) {
      this.recentValues = this.recentValues.slice(-TREND_HISTORY_SIZE);
    }
    const trend = this.recentValues.length >= 2 ? this.computeTrend() : undefined;

    // Freshness
    let freshness: 'live' | 'stale' | 'mock';
    if (events.length > 0) {
      freshness = 'live';
    } else if (this.hasReceivedEvents) {
      freshness = 'stale';
    } else {
      freshness = 'mock';
    }

    return {
      id: this.kpiId,
      value,
      delta,
      trend: this.recentValues.length >= 2 ? [...this.recentValues] : undefined,
      freshness,
      source: `projection:${this.sourceFamily}`,
    };
  }

  /** Simple linear regression slope over recent values. */
  private computeTrend(): number {
    const n = this.recentValues.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += this.recentValues[i];
      sumXY += i * this.recentValues[i];
      sumXX += i * i;
    }
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  }
}
