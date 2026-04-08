import { describe, expect, it } from 'vitest';
import { STATIC_PIPELINE_MAP } from '../../kpis/static-pipelines.js';

describe('STATIC_PIPELINE_MAP', () => {
  it('computes reopen_rate as reopened completions over total completions', () => {
    const descriptor = STATIC_PIPELINE_MAP.reopen_rate;

    expect(descriptor.sources).toEqual([{ family: 'system.event', filter: { type: 'task_completed' } }]);
    expect(descriptor.aggregation).toEqual({
      type: 'rate',
      numerator: { type: 'count_where', predicate: { reopened: 'true' } },
      denominator: { type: 'count' },
    });
  });
});
