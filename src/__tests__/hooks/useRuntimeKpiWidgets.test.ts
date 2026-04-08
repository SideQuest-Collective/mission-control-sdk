import { describe, expect, it } from 'vitest';
import { mergeRuntimeKpiWidgets } from '../../hooks/useRuntimeKpiWidgets.js';
import type { TeamSpecificWidgetDescriptor } from '../../types.js';
import type { ActiveKpi } from '../../kpis/types.js';

function widget(
  id: string,
  derivedFrom: string,
): TeamSpecificWidgetDescriptor {
  return {
    id,
    title: id,
    primitive: 'stat-card',
    data_source: `kpi.flow.${id.replace(/-/g, '_')}`,
    derived_from: derivedFrom,
    config: {},
    grid: { w: 3, h: 3 },
  };
}

function activeKpi(
  id: string,
  derivedFrom: string,
): ActiveKpi {
  return {
    id: id.replace(/-/g, '_'),
    team_slug: 'team-a',
    kpi_definition: {
      id: id.replace(/-/g, '_'),
      name: id,
      category: 'flow',
      unit: 'count',
      description: id,
      data_source: 'dynamic:team',
    },
    pipeline: {
      version: 1,
      sources: [{ family: 'run.ended' }],
      aggregation: { type: 'count' },
      window: '1h',
      output_unit: 'count',
    },
    widget_descriptor: widget(id, derivedFrom),
    origin: derivedFrom === 'runtime-agent' ? 'runtime_agent' : 'bootstrap_llm',
    activated_at: '2026-04-08T00:00:00.000Z',
  };
}

describe('mergeRuntimeKpiWidgets', () => {
  it('keeps static manifest widgets while dropping inactive bootstrap widgets', () => {
    const merged = mergeRuntimeKpiWidgets(
      [
        widget('cycle-time', 'development'),
        widget('old-bootstrap-kpi', 'llm-generated'),
      ],
      [activeKpi('new-runtime-kpi', 'runtime-agent')],
    );

    expect(merged.map((entry) => entry.id)).toEqual([
      'cycle-time',
      'new-runtime-kpi',
    ]);
  });

  it('prefers the active widget descriptor for bootstrap-selected KPIs', () => {
    const merged = mergeRuntimeKpiWidgets(
      [widget('quality-score', 'llm-generated')],
      [activeKpi('quality-score', 'bootstrap-llm')],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].derived_from).toBe('bootstrap-llm');
  });
});
