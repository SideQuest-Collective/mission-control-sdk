import type { KpiValue, KpiDefinition } from '../../types.js';
import type { KpiProjectionEngine } from '../../kpis/projection-engine.js';

export interface KpisRouterDeps {
  getKpis(rolePacks?: string[]): Promise<KpiValue[]>;
  getKpi(id: string): Promise<KpiValue | null>;
  getRegistry(): KpiDefinition[] | Promise<KpiDefinition[]>;
  projectionEngine?: KpiProjectionEngine;
}

/**
 * Creates a KPIs route handler factory.
 * Routes: GET / (list, filtered by role_packs query), GET /:id (single KPI detail).
 *
 * When a projectionEngine is provided, computeAll() is used to produce live
 * KpiValues from telemetry. Falls back to the deps.getKpis / deps.getKpi
 * callbacks when no engine is available.
 */
export function createKpisRouter(deps: KpisRouterDeps) {
  return function mount(router: { get: Function }): void {
    // GET / — list KPIs, optionally filtered by role_packs
    router.get('/', async (req: any, res: any) => {
      try {
        const rolePacksParam = req.query.role_packs;
        const rolePacks = typeof rolePacksParam === 'string'
          ? rolePacksParam.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined;

        if (deps.projectionEngine) {
          const computed = deps.projectionEngine.computeAll();
          const registry = await deps.getRegistry();

          // Filter by role_packs if specified
          let filtered: KpiValue[];
          if (rolePacks && rolePacks.length > 0) {
            const { getKpisForRolePacks } = await import('../../kpis/role-pack-map.js');
            const allowedIds = new Set(getKpisForRolePacks(rolePacks).map((k) => k.id));
            filtered = [...computed.values()].filter((v) => allowedIds.has(v.id));
          } else {
            filtered = [...computed.values()];
          }

          // Ensure every registered KPI has an entry (mock for those without projections)
          const resultMap = new Map(filtered.map((v) => [v.id, v]));
          for (const def of registry) {
            if (!resultMap.has(def.id)) {
              resultMap.set(def.id, {
                id: def.id,
                value: 0,
                freshness: 'mock',
                source: 'projection:none',
              });
            }
          }

          res.json({ kpis: [...resultMap.values()] });
        } else {
          const kpis = await deps.getKpis(rolePacks);
          res.json({ kpis });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /:id — single KPI detail
    router.get('/:id', async (req: any, res: any) => {
      try {
        let kpi: KpiValue | null;

        if (deps.projectionEngine) {
          kpi = deps.projectionEngine.compute(req.params.id) ?? null;
        } else {
          kpi = await deps.getKpi(req.params.id);
        }

        if (!kpi) {
          res.status(404).json({ error: 'KPI not found' });
          return;
        }

        // Enrich with definition metadata
        const definition = (await deps.getRegistry()).find((d) => d.id === kpi!.id);
        res.json({ kpi, definition: definition ?? null });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
