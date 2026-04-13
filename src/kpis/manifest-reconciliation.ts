import type { KpiDefinition, TeamSpecificWidgetDescriptor } from '../types.js';
import type { ActiveKpi, KpiCatalogEntry, PipelineDescriptor } from './types.js';

export interface ManifestDynamicEntry {
  definition: KpiDefinition;
  pipeline: PipelineDescriptor;
  widgetDescriptor: TeamSpecificWidgetDescriptor;
}

export interface ManifestDynamicReconciliationPlan {
  staleBootstrapIds: string[];
  activeEntries: Array<{
    activeKpi: ActiveKpi;
    catalogEntry: KpiCatalogEntry;
  }>;
}

interface PlanManifestDynamicReconciliationInput {
  teamSlug: string;
  now: string;
  manifestEntries: ManifestDynamicEntry[];
  activeKpis: ActiveKpi[];
  catalogEntries: KpiCatalogEntry[];
}

export function planManifestDynamicReconciliation(
  input: PlanManifestDynamicReconciliationInput,
): ManifestDynamicReconciliationPlan {
  const catalogById = new Map(input.catalogEntries.map((entry) => [entry.id, entry]));
  const manifestIds = new Set(input.manifestEntries.map((entry) => entry.definition.id));

  return {
    staleBootstrapIds: input.activeKpis
      .filter((kpi) => kpi.origin === 'bootstrap_llm' && !manifestIds.has(kpi.id))
      .map((kpi) => kpi.id),
    activeEntries: input.manifestEntries.map((entry) => {
      const existingCatalog = catalogById.get(entry.definition.id);

      return {
        activeKpi: {
          id: entry.definition.id,
          team_slug: input.teamSlug,
          kpi_definition: entry.definition,
          pipeline: entry.pipeline,
          widget_descriptor: entry.widgetDescriptor,
          origin: 'bootstrap_llm',
          proposed_by: existingCatalog?.proposed_by,
          activated_at: existingCatalog?.last_active ?? input.now,
        },
        catalogEntry: {
          id: entry.definition.id,
          team_slug: input.teamSlug,
          kpi_definition: entry.definition,
          pipeline: entry.pipeline,
          origin: 'bootstrap_llm',
          proposed_by: existingCatalog?.proposed_by,
          first_registered: existingCatalog?.first_registered ?? input.now,
          last_active: input.now,
          times_bootstrapped: (existingCatalog?.times_bootstrapped ?? 0) + 1,
          replaced_by: existingCatalog?.replaced_by,
          status: 'active',
        },
      };
    }),
  };
}
