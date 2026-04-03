import type { KpiDefinition, KpiValue } from '../types.js';
import type { SkynetEvent } from '../skynet/types.js';
import type { TelemetrySubscriber } from '../skynet/telemetry.js';
import type { PipelineDescriptor, TelemetryFamily } from './types.js';
import { KpiProjection } from './projection.js';

const DEFAULT_FLUSH_INTERVAL_MS = 30_000;

/**
 * Manages all active KPI projections.
 * Subscribes to telemetry events, fans out to projections, and periodically caches computed values.
 */
export class KpiProjectionEngine {
  private projections: Map<string, KpiProjection> = new Map();
  private cache: Map<string, KpiValue> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private subscriber: TelemetrySubscriber | null = null;
  private subscribedFamilies: Set<string> = new Set();
  private readonly flushIntervalMs: number;

  constructor(flushIntervalMs: number = DEFAULT_FLUSH_INTERVAL_MS) {
    this.flushIntervalMs = flushIntervalMs;
  }

  /** Register a KPI and its pipeline. Creates a new projection. */
  register(kpi: KpiDefinition, pipeline: PipelineDescriptor): void {
    const projection = new KpiProjection(kpi, pipeline);
    this.projections.set(kpi.id, projection);

    // If we have an active subscriber, subscribe to this family
    if (this.subscriber) {
      const family = pipeline.sources[0].family;
      this.ensureSubscribed(family);
    }
  }

  /** Remove a projection by KPI ID. */
  unregister(kpiId: string): void {
    this.projections.delete(kpiId);
    this.cache.delete(kpiId);
  }

  /** Fan out an incoming event to all projections. */
  ingest(event: SkynetEvent): void {
    for (const projection of this.projections.values()) {
      projection.ingest(event);
    }
  }

  /** Compute all projections and return the results. */
  computeAll(now?: number): Map<string, KpiValue> {
    const results = new Map<string, KpiValue>();
    for (const [id, projection] of this.projections) {
      const value = projection.compute(now);
      results.set(id, value);
      this.cache.set(id, value);
    }
    return results;
  }

  /** Compute a single KPI. Returns null if KPI is not registered. */
  compute(kpiId: string, now?: number): KpiValue | null {
    const projection = this.projections.get(kpiId);
    if (!projection) return null;
    const value = projection.compute(now);
    this.cache.set(kpiId, value);
    return value;
  }

  /** Get the last cached value for a KPI. */
  getCached(kpiId: string): KpiValue | undefined {
    return this.cache.get(kpiId);
  }

  /** Subscribe to telemetry events and start the periodic flush timer. */
  start(subscriber: TelemetrySubscriber): void {
    this.subscriber = subscriber;
    this.subscribedFamilies.clear();

    // Collect all families from active projections
    const families = new Set<TelemetryFamily>();
    for (const [, projection] of this.projections) {
      // Access the source family via the projection's kpiId and our stored pipelines
      // We need to subscribe to all known families since projections filter internally
    }

    // Subscribe to all telemetry families that projections might care about
    const allFamilies: TelemetryFamily[] = [
      'run.ended',
      'run.started',
      'usage.delta',
      'cost.estimated',
      'session.ended',
      'system.event',
    ];
    for (const family of allFamilies) {
      this.ensureSubscribed(family);
    }

    // Start flush timer
    this.flushTimer = setInterval(() => {
      this.computeAll();
    }, this.flushIntervalMs);
  }

  /** Stop the flush timer and unsubscribe from telemetry. */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.subscriber) {
      for (const family of this.subscribedFamilies) {
        this.subscriber.unsubscribe(family);
      }
      this.subscribedFamilies.clear();
      this.subscriber = null;
    }
  }

  /** Number of registered projections. */
  get size(): number {
    return this.projections.size;
  }

  /** Whether the engine is actively running (has a subscriber and flush timer). */
  get running(): boolean {
    return this.flushTimer !== null;
  }

  private ensureSubscribed(family: string): void {
    if (!this.subscriber || this.subscribedFamilies.has(family)) return;
    this.subscriber.subscribe(family, (event: SkynetEvent) => {
      this.ingest(event);
    });
    this.subscribedFamilies.add(family);
  }
}
