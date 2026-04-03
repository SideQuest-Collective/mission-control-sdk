export interface UsageMetrics {
  period: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_requests: number;
  by_agent: Array<{
    agent_id: string;
    input_tokens: number;
    output_tokens: number;
    requests: number;
  }>;
}

export interface UsageRouterDeps {
  getUsage(period?: string): Promise<UsageMetrics>;
}

/**
 * Creates a usage route handler factory.
 * Route: GET / (token usage by period: 24h, 7d, 30d).
 */
export function createUsageRouter(deps: UsageRouterDeps) {
  return function mount(router: { get: Function }): void {
    // GET / — token usage by period
    router.get('/', async (req: any, res: any) => {
      try {
        const period = req.query.period ?? '24h';
        const usage = await deps.getUsage(period);
        res.json(usage);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
