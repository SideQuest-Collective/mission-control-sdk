import type { SkynetEvent } from '../skynet/types.js';
import type { AggregationType } from './types.js';

/**
 * Extract a numeric value from an event payload by dot-delimited path.
 * Returns NaN if the field is missing or non-numeric.
 */
function extractNumeric(event: SkynetEvent, field: string): number {
  const parts = field.split('.');
  let current: unknown = event.payload;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return NaN;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'number' ? current : Number(current);
}

/** Check if an event's payload matches a predicate (all key-value pairs must match). */
function matchesPredicate(event: SkynetEvent, predicate: Record<string, string>): boolean {
  for (const [key, expected] of Object.entries(predicate)) {
    const parts = key.split('.');
    let current: unknown = event.payload;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return false;
      current = (current as Record<string, unknown>)[part];
    }
    if (String(current) !== expected) return false;
  }
  return true;
}

/** Compute a percentile from sorted numeric values (nearest-rank method). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Apply an aggregation function to a set of events.
 * Returns a single numeric value.
 */
export function aggregate(events: SkynetEvent[], config: AggregationType): number {
  switch (config.type) {
    case 'count':
      return events.length;

    case 'count_where':
      return events.filter((e) => matchesPredicate(e, config.predicate)).length;

    case 'avg': {
      if (events.length === 0) return 0;
      const values = events.map((e) => extractNumeric(e, config.field)).filter((v) => !isNaN(v));
      if (values.length === 0) return 0;
      return values.reduce((a, b) => a + b, 0) / values.length;
    }

    case 'sum': {
      return events
        .map((e) => extractNumeric(e, config.field))
        .filter((v) => !isNaN(v))
        .reduce((a, b) => a + b, 0);
    }

    case 'p50': {
      const values = events
        .map((e) => extractNumeric(e, config.field))
        .filter((v) => !isNaN(v))
        .sort((a, b) => a - b);
      return percentile(values, 50);
    }

    case 'p90': {
      const values = events
        .map((e) => extractNumeric(e, config.field))
        .filter((v) => !isNaN(v))
        .sort((a, b) => a - b);
      return percentile(values, 90);
    }

    case 'max': {
      const values = events.map((e) => extractNumeric(e, config.field)).filter((v) => !isNaN(v));
      if (values.length === 0) return 0;
      return Math.max(...values);
    }

    case 'min': {
      const values = events.map((e) => extractNumeric(e, config.field)).filter((v) => !isNaN(v));
      if (values.length === 0) return 0;
      return Math.min(...values);
    }

    case 'rate': {
      const denominator = aggregate(events, config.denominator);
      if (denominator === 0) return 0;
      const numerator = aggregate(events, config.numerator);
      return numerator / denominator;
    }
  }
}
