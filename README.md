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

<ThemeProvider>
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

## Dynamic KPI System

Beyond the 22 static baseline KPIs, teams can have up to 10 dynamic KPIs generated at compile-time by an LLM or registered at runtime by agents. Both paths produce the same artifact: a `KpiDefinition` paired with a `PipelineDescriptor` that the `KpiProjectionEngine` turns into live values.

### Two paths to dynamic KPIs

**Compile-time (bootstrap):** During `buildMissionControlTeamBlockAsync()`, an LLM reads the team's purpose, roster, and role packs to generate team-specific and per-agent KPIs. These are deduplicated against the static baseline and stored in the team block as `kpi_registry`, `pipelines`, and `kpi_catalog`.

**Runtime (agent-driven):** Agents propose new KPIs via the SDK's HTTP API. Proposals go through a dual-gate approval flow (team quorum + operator approval) before activation.

### Runtime KPI registration

```
POST /api/kpis/propose
{
  "kpi": {
    "id": "scrape_success_rate",
    "name": "Scrape Success Rate",
    "category": "execution",
    "unit": "percent",
    "scope": "agent",
    "agent_id": "scrape-analyst",
    "description": "Percentage of scrape runs completing without errors"
  },
  "pipeline": {
    "version": 1,
    "sources": [{ "family": "run.ended", "filter": { "agent_id": "scrape-analyst" } }],
    "aggregation": {
      "type": "rate",
      "numerator": { "type": "count_where", "predicate": { "payload.success": "true" } },
      "denominator": { "type": "count" }
    },
    "window": "24h",
    "output_unit": "percent"
  },
  "reason": "Track scrape reliability after discovering intermittent failures"
}
```

### Approval flow

1. Agent submits proposal via `POST /api/kpis/propose`
2. Team agents are notified via mesh broadcast
3. Agents vote via `POST /api/kpis/proposals/:id/vote` (majority quorum required)
4. Operator approves via the Mission Control dashboard
5. Both gates pass → KPI activated with live pipeline

Proposals expire after 24 hours. Rejection at any gate stops the proposal.

### Capacity and replacement

A team can have at most **10 dynamic KPIs** active at any time. Static baseline KPIs do not count toward this cap. When at capacity, a new proposal must include a `replaces` field nominating an existing dynamic KPI to drop.

```
GET /api/kpis/capacity → { "active": 7, "max": 10, "remaining": 3 }
```

### Projection engine

The `KpiProjectionEngine` subscribes to Skynet telemetry events, fans them out to per-KPI projections, and produces `KpiValue` objects with value, delta, trend, and freshness.

```typescript
import { KpiProjectionEngine } from '@sidequestteams/mission-control-sdk/kpis';

const engine = new KpiProjectionEngine();
engine.register(kpiDefinition, pipelineDescriptor);
engine.start(telemetrySubscriber);

// Values are computed on a 30s flush cycle, or on-demand:
const values = engine.computeAll();
const single = engine.compute('scrape_success_rate');
```

### Pipeline descriptor format

```typescript
interface PipelineDescriptor {
  version: 1;
  sources: [{ family: TelemetryFamily; filter?: Record<string, string> }];
  aggregation: AggregationType;  // count | count_where | avg | sum | p50 | p90 | max | min | rate
  window: string;                // "1h" | "6h" | "24h" | "7d"
  output_unit: string;           // "count" | "percent" | "hours" | "ms"
}
```

Aggregation types: `count`, `count_where` (with predicate), `avg`/`sum`/`p50`/`p90`/`max`/`min` (with field), and `rate` (numerator/denominator, both aggregations).

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
