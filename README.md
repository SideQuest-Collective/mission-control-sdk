# @sidequestteams/mission-control-sdk

Commons library for building per-team Mission Control dashboards. Provides UI primitives, theming, data hooks, a Skynet client, backend route handlers, KPI registry, and Handlebars scaffold templates.

## Architecture

```
mission-control-sdk (this repo)
  └─ Shared library consumed by team dashboard instances

SideQuestTeams super-repo (bootstrap compiler)
  └─ npm dependency: @sidequestteams/mission-control-sdk
  └─ Compiler reads team-spec + SDK templates → stamps out team dashboard

teams/generated/{team}/mission-control/
  └─ Fully working Next.js app + Express backend
  └─ Imports this SDK for shared primitives, hooks, and theming
  └─ Team agents own and can extend post-bootstrap
```

## Package Structure

```
src/
  primitives/       StatCard, Sparkline, BarChart, Table, List, StatusGrid, Timeline, DynamicWidget
  widgets/          AgentListWidget, CostTrackerWidget, ActivityFeedWidget, TaskBoardWidget, TokenUsageWidget
  theme/            ThemeProvider (CSS custom properties), tokens, dark/light utils
  hooks/            useManifest, useAgents, useKpis, useActivity, useTasks, useCosts
  skynet/           WebSocket+HTTP client, telemetry subscriber, agent-state poller, control-plane
  backend/          Route handler factories (agents, kpis, telemetry, theme), skynet-proxy middleware
  kpis/             Registry (22 KPIs, 4 categories), role-pack map (5 pack mappings)
  types.ts          TeamBlock, VisualTheme, WidgetManifest, AgentState, KpiDefinition, etc.
templates/          Handlebars scaffolds for per-team dashboard generation
```

## Installation

```bash
npm install @sidequestteams/mission-control-sdk
```

Or as a git dependency:

```json
{
  "dependencies": {
    "@sidequestteams/mission-control-sdk": "github:SideQuest-Collective/mission-control-sdk"
  }
}
```

## Usage

### Primitives

Reusable UI building blocks. All use CSS custom properties (`--mc-*`) for theming — no hardcoded colors.

```tsx
import { StatCard, Sparkline, BarChart, DynamicWidget } from '@sidequestteams/mission-control-sdk/primitives';

<StatCard value="42" label="Active Tasks" delta={3} />
<Sparkline value="1.2h" label="Cycle Time" data={[1.5, 1.3, 1.2, 1.1, 1.2]} unit="hours" />
<BarChart data={[{ label: 'Agent A', value: 1200 }, { label: 'Agent B', value: 800 }]} />
```

`DynamicWidget` renders team-specific widgets from descriptors — no code changes needed:

```tsx
<DynamicWidget descriptor={{ id: 'review-time', primitive: 'sparkline', data_source: 'kpi.flow.cycle_time', ... }} />
```

### Default Widgets

Pre-built, polished components every team gets:

```tsx
import { AgentListWidget, CostTrackerWidget, ActivityFeedWidget, TaskBoardWidget, TokenUsageWidget } from '@sidequestteams/mission-control-sdk/widgets';
```

### Theming

The `ThemeProvider` reads `visual_theme` from the runtime manifest and sets CSS custom properties at the document root. Supports dark/light mode.

```tsx
import { ThemeProvider, useTheme } from '@sidequestteams/mission-control-sdk/theme';

<ThemeProvider manifestPath="/api/manifest">
  <App />
</ThemeProvider>

// In any component:
const { theme, mode, toggle } = useTheme();
```

### Data Hooks

Each hook manages its own fetch + poll cycle with WebSocket invalidation:

```tsx
import { useAgents, useKpis, useCosts, useManifest } from '@sidequestteams/mission-control-sdk/hooks';

const { agents, loading } = useAgents();       // 10s poll
const { kpis } = useKpis();                    // 60s poll, filtered by role_packs
const { total, byAgent, trend } = useCosts();  // 30s poll
const { team } = useManifest();                // Runtime manifest team block
```

### Skynet Client

WebSocket + HTTP connection to Skynet with auto-reconnect:

```tsx
import { SkynetClient, TelemetrySubscriber, ControlPlane } from '@sidequestteams/mission-control-sdk/skynet';

const client = new SkynetClient({ wsUrl: 'ws://skynet:9100', httpUrl: 'http://skynet:9100' });
await client.connect();

const telemetry = new TelemetrySubscriber(client);
telemetry.subscribe('agent-update', (event) => { /* ... */ });

const cp = new ControlPlane(client);
await cp.health();
```

### Backend Route Handlers

Framework-agnostic route handler factories:

```tsx
import { createAgentsRouter, createKpisRouter, createThemeRouter } from '@sidequestteams/mission-control-sdk/backend';

app.use('/api/agents', createAgentsRouter({ skynetClient }));
app.use('/api/kpis', createKpisRouter({ teamBlock }));
app.use('/api/theme', createThemeRouter({ teamBlock }));
```

### KPI Registry

22 KPIs across 4 categories, with role-pack mapping:

```tsx
import { KPI_REGISTRY, getKpisForRolePacks } from '@sidequestteams/mission-control-sdk/kpis';

// Get KPIs relevant to a team's role packs
const kpis = getKpisForRolePacks(['development', 'review']);
// → cycle_time, throughput, blocked_age, tool_backed_runs, verified_completions, review_wait, reopen_rate, intent_only_runs
```

## Scaffold Templates

Handlebars templates at `templates/` are used by the bootstrap compiler to stamp out per-team dashboards:

| Template | Output | Description |
|----------|--------|-------------|
| `app/layout.tsx.hbs` | `src/app/layout.tsx` | Next.js layout with ThemeProvider |
| `app/page.tsx.hbs` | `src/app/page.tsx` | Dashboard with default + dynamic widgets |
| `app/globals.css.hbs` | `src/app/globals.css` | CSS custom properties from visual_theme |
| `backend/server.ts.hbs` | `src/backend/server.ts` | Express server with SDK routes |
| `config/*.hbs` | Root configs | tailwind, next, tsconfig, postcss |
| `package.json.hbs` | `package.json` | Dependencies with SDK pre-wired |

## Team-Side Evolution

Post-bootstrap, team agents own their dashboard instance and can:

- Add custom widgets in `components/`
- Add new pages under `app/`
- Add custom API routes using the SDK's Skynet client
- Override default widgets by wrapping or replacing
- Change layout by editing `page.tsx`
- Pin SDK version — updates are opt-in via `package.json`

## License

Private — SideQuest-Collective internal use.
