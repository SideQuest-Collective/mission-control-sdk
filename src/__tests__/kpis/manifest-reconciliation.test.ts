import { describe, expect, it } from 'vitest';
import { planManifestDynamicReconciliation } from '../../kpis/manifest-reconciliation.js';
import type { ActiveKpi, KpiCatalogEntry } from '../../kpis/types.js';
import type { KpiDefinition, TeamSpecificWidgetDescriptor } from '../../types.js';

function definition(id: string): KpiDefinition {
  return {
    id,
    name: id,
    category: 'flow',
    unit: 'count',
    description: id,
    data_source: 'dynamic:team',
  };
}

function widget(id: string): TeamSpecificWidgetDescriptor {
  return {
    id: id.replace(/_/g, '-'),
    title: id,
    primitive: 'stat-card',
    data_source: `kpi.flow.${id}`,
    derived_from: 'llm-generated',
    config: {},
    grid: { w: 3, h: 3 },
  };
}

function activeKpi(id: string, origin: ActiveKpi['origin']): ActiveKpi {
  return {
    id,
    team_slug: 'team-a',
    kpi_definition: definition(id),
    pipeline: {
      version: 1,
      sources: [{ family: 'run.ended' }],
      aggregation: { type: 'count' },
      window: '1h',
      output_unit: 'count',
    },
    widget_descriptor: widget(id),
    origin,
    activated_at: '2026-04-05T00:00:00.000Z',
  };
}

function catalogEntry(
  id: string,
  status: KpiCatalogEntry['status'],
): KpiCatalogEntry {
  return {
    id,
    team_slug: 'team-a',
    kpi_definition: definition(id),
    pipeline: {
      version: 1,
      sources: [{ family: 'run.ended' }],
      aggregation: { type: 'count' },
      window: '1h',
      output_unit: 'count',
    },
    origin: 'bootstrap_llm',
    proposed_by: 'agent-7',
    first_registered: '2026-04-01T00:00:00.000Z',
    last_active: '2026-04-06T00:00:00.000Z',
    times_bootstrapped: 2,
    status,
  };
}

describe('planManifestDynamicReconciliation', () => {
  it('archives stale bootstrap KPIs but leaves runtime-added KPIs alone', () => {
    const plan = planManifestDynamicReconciliation({
      teamSlug: 'team-a',
      now: '2026-04-08T00:00:00.000Z',
      manifestEntries: [
        {
          definition: definition('restored_kpi'),
          pipeline: {
            version: 1,
            sources: [{ family: 'run.ended' }],
            aggregation: { type: 'count' },
            window: '1h',
            output_unit: 'count',
          },
          widgetDescriptor: widget('restored_kpi'),
        },
      ],
      activeKpis: [
        activeKpi('removed_bootstrap_kpi', 'bootstrap_llm'),
        activeKpi('runtime_only_kpi', 'runtime_agent'),
      ],
      catalogEntries: [
        catalogEntry('removed_bootstrap_kpi', 'active'),
        catalogEntry('restored_kpi', 'archived'),
      ],
    });

    expect(plan.staleBootstrapIds).toEqual(['removed_bootstrap_kpi']);
    expect(plan.activeEntries).toHaveLength(1);
    expect(plan.activeEntries[0].activeKpi.id).toBe('restored_kpi');
    expect(plan.activeEntries[0].catalogEntry.status).toBe('active');
  });

  it('reactivates manifest-selected KPIs even when the catalog row is archived', () => {
    const now = '2026-04-08T00:00:00.000Z';
    const plan = planManifestDynamicReconciliation({
      teamSlug: 'team-a',
      now,
      manifestEntries: [
        {
          definition: definition('restored_kpi'),
          pipeline: {
            version: 1,
            sources: [{ family: 'run.ended' }],
            aggregation: { type: 'count' },
            window: '1h',
            output_unit: 'count',
          },
          widgetDescriptor: widget('restored_kpi'),
        },
      ],
      activeKpis: [],
      catalogEntries: [catalogEntry('restored_kpi', 'archived')],
    });

    expect(plan.activeEntries[0].activeKpi.activated_at).toBe('2026-04-06T00:00:00.000Z');
    expect(plan.activeEntries[0].catalogEntry.first_registered).toBe('2026-04-01T00:00:00.000Z');
    expect(plan.activeEntries[0].catalogEntry.last_active).toBe(now);
  });
});
