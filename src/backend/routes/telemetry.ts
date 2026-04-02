export interface TimeSeriesPoint {
  timestamp: number;
  messagesSent: number;
  messagesReceived: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  queueDepth: number;
  circuitState: string;
  failures: number;
}

export interface OverallMetrics {
  agents: Array<{
    agentId: string;
    messagesSent: number;
    messagesReceived: number;
    avgLatencyMs: number;
    failures: number;
  }>;
  queriedAt: number;
}

export interface TelemetryRouterDeps {
  getOverallMetrics(): Promise<OverallMetrics>;
  getAgentTimeSeries(agentId: string, hours?: number): Promise<TimeSeriesPoint[]>;
}

/**
 * Creates a telemetry route handler factory.
 * Routes: GET /metrics (overall), GET /agents/:id/timeseries (per-agent).
 */
export function createTelemetryRouter(deps: TelemetryRouterDeps) {
  return function mount(router: { get: Function }): void {
    // GET /metrics — overall telemetry metrics
    router.get('/metrics', async (_req: any, res: any) => {
      try {
        const metrics = await deps.getOverallMetrics();
        res.json(metrics);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /agents/:id/timeseries — per-agent time series
    router.get('/agents/:id/timeseries', async (req: any, res: any) => {
      try {
        const hours = req.query.hours ? Number(req.query.hours) : 24;
        const data = await deps.getAgentTimeSeries(req.params.id, hours);
        res.json({ agentId: req.params.id, data });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
