import type { AgentState } from '../../types.js';

export interface AgentsRouterDeps {
  getAgents(): Promise<AgentState[]>;
  getAgent(id: string): Promise<AgentState | null>;
  resetAgent(id: string): Promise<{ ok: boolean; message?: string }>;
}

/**
 * Creates an agents route handler factory.
 * Routes: GET / (list), GET /:id (detail), POST /:id/reset (reset).
 */
export function createAgentsRouter(deps: AgentsRouterDeps) {
  return function mount(router: { get: Function; post: Function }): void {
    // GET / — list all agents
    router.get('/', async (_req: any, res: any) => {
      try {
        const agents = await deps.getAgents();
        res.json({ agents });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /:id — agent detail
    router.get('/:id', async (req: any, res: any) => {
      try {
        const agent = await deps.getAgent(req.params.id);
        if (!agent) {
          res.status(404).json({ error: 'Agent not found' });
          return;
        }
        res.json({ agent });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // POST /:id/reset — reset agent
    router.post('/:id/reset', async (req: any, res: any) => {
      try {
        const result = await deps.resetAgent(req.params.id);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
