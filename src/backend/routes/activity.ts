export interface ActivityEvent {
  id: string;
  type: string;
  agent_id: string;
  summary: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityRouterDeps {
  getActivity(limit?: number): Promise<ActivityEvent[]>;
}

/**
 * Creates an activity route handler factory.
 * Route: GET / (list recent activity events, proxied from Skynet).
 */
export function createActivityRouter(deps: ActivityRouterDeps) {
  return function mount(router: { get: Function }): void {
    // GET / — list recent activity events
    router.get('/', async (req: any, res: any) => {
      try {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const events = await deps.getActivity(limit);
        res.json({ events });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
