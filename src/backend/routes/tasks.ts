import type { GithubIssue, GithubPR, KanbanBoard } from '../services/github-client.js';

export type { GithubIssue, GithubPR, KanbanBoard };

export interface TasksRouterDeps {
  getIssues(filters?: { state?: string; labels?: string; assignee?: string }): Promise<GithubIssue[]>;
  getPullRequests(state?: string): Promise<GithubPR[]>;
  getBoard(): Promise<KanbanBoard>;
  updateIssue(id: number, update: { labels?: string[]; assignees?: string[] }): Promise<void>;
}

/**
 * Creates a tasks route handler factory.
 * Routes: GET / (issues), GET /prs (pull requests), GET /board (kanban), PATCH /:id (update).
 */
export function createTasksRouter(deps: TasksRouterDeps) {
  return function mount(router: { get: Function; patch: Function }): void {
    // GET / — list issues with optional filters
    router.get('/', async (req: any, res: any) => {
      try {
        const filters: { state?: string; labels?: string; assignee?: string } = {};
        if (req.query.state) filters.state = req.query.state;
        if (req.query.labels) filters.labels = req.query.labels;
        if (req.query.assignee) filters.assignee = req.query.assignee;

        const issues = await deps.getIssues(Object.keys(filters).length ? filters : undefined);
        res.json({ issues });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /prs — list pull requests
    router.get('/prs', async (req: any, res: any) => {
      try {
        const prs = await deps.getPullRequests(req.query.state);
        res.json({ prs });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // GET /board — kanban board
    router.get('/board', async (_req: any, res: any) => {
      try {
        const board = await deps.getBoard();
        res.json(board);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });

    // PATCH /:id — update issue labels/assignees
    router.patch('/:id', async (req: any, res: any) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: 'Invalid issue id' });
          return;
        }

        const { labels, assignees } = req.body ?? {};
        await deps.updateIssue(id, { labels, assignees });
        res.json({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
