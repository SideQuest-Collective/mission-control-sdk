import { describe, expect, it } from 'vitest';
import { filterKpisForRolePacks } from '../../hooks/useKpis.js';

describe('filterKpisForRolePacks', () => {
  it('keeps dynamic KPI ids even when filtering by static role packs', () => {
    const filtered = filterKpisForRolePacks([
      { id: 'cycle_time', value: 12, freshness: 'mock', source: 'sdk-default' },
      { id: 'runtime_unique_kpi', value: 3, freshness: 'mock', source: 'sdk-default' },
    ], ['development']);

    expect(filtered.map((kpi) => kpi.id)).toEqual(['cycle_time', 'runtime_unique_kpi']);
  });

  it('still removes static KPIs that are outside the selected role packs', () => {
    const filtered = filterKpisForRolePacks([
      { id: 'cycle_time', value: 12, freshness: 'mock', source: 'sdk-default' },
      { id: 'review_wait', value: 4, freshness: 'mock', source: 'sdk-default' },
    ], ['development']);

    expect(filtered.map((kpi) => kpi.id)).toEqual(['cycle_time']);
  });
});
