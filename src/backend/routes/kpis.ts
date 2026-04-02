import type { KpiValue, KpiDefinition } from '../../types.js';

export interface KpisRouterDeps {
  getKpis(rolePacks?: string[]): Promise<KpiValue[]>;
  getKpi(id: string): Promise<KpiValue | null>;
  getRegistry(): KpiDefinition[];
}

/**
 * Creates a KPIs route handler factory.
 * Routes: GET / (list, filtered by role_packs query), GET /:id (single KPI detail).
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

        const kpis = await deps.getKpis(rolePacks);
        res.json({ kpis });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /:id — single KPI detail
    router.get('/:id', async (req: any, res: any) => {
      try {
        const kpi = await deps.getKpi(req.params.id);
        if (!kpi) {
          res.status(404).json({ error: 'KPI not found' });
          return;
        }

        // Enrich with definition metadata
        const definition = deps.getRegistry().find((d) => d.id === kpi.id);
        res.json({ kpi, definition: definition ?? null });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
