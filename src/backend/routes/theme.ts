import type { TeamBlock } from '../../types.js';

export interface ThemeRouterDeps {
  getTeamBlock(): Promise<TeamBlock | null>;
}

/**
 * Creates a theme route handler factory.
 * Route: GET / (serves theme object from manifest team block). No auth required.
 */
export function createThemeRouter(deps: ThemeRouterDeps) {
  return function mount(router: { get: Function }): void {
    // GET / — serve theme from manifest team block
    router.get('/', async (_req: any, res: any) => {
      try {
        const teamBlock = await deps.getTeamBlock();
        if (!teamBlock) {
          res.status(404).json({ error: 'Team block not found' });
          return;
        }

        res.json({
          theme: teamBlock.visual_theme,
          theme_light: teamBlock.visual_theme_light ?? null,
          identity: teamBlock.identity,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        res.status(500).json({ error: message });
      }
    });
  };
}
