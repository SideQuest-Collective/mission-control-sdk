export interface CostSummary {
  total: number;
  period: string;
  currency: string;
  by_model: Record<string, number>;
}

export interface CostBreakdown {
  agent_id: string;
  agent_name: string;
  total: number;
  input_tokens: number;
  output_tokens: number;
}

export interface CostsRouterDeps {
  getSummary(period?: string): Promise<CostSummary>;
  getBreakdown(): Promise<CostBreakdown[]>;
}

/**
 * Creates a costs route handler factory.
 * Routes: GET /summary (cost summary), GET /breakdown (cost breakdown by agent).
 */
export function createCostsRouter(deps: CostsRouterDeps) {
  return function mount(router: { get: Function }): void {
    // GET /summary — cost summary with period filter
    router.get('/summary', async (req: any, res: any) => {
      try {
        const period = req.query.period ?? '24h';
        const summary = await deps.getSummary(period);
        res.json(summary);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /breakdown — cost breakdown by agent
    router.get('/breakdown', async (_req: any, res: any) => {
      try {
        const breakdown = await deps.getBreakdown();
        res.json({ breakdown });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
