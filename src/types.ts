/** Runtime manifest team block — single source of truth for a team's dashboard */
export interface TeamBlock {
  identity: TeamIdentity;
  soul: string;
  roster: RosterEntry[];
  role_packs: string[];
  visual_theme: VisualTheme;
  visual_theme_light?: VisualTheme;
  widgets: WidgetManifest;
  connectivity: ConnectivityConfig;
}

export interface TeamIdentity {
  name: string;
  purpose: string;
  theme: string;
}

export interface RosterEntry {
  role: string;
  model: string;
  skills: string[];
}

export interface VisualTheme {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text_primary: string;
  text_secondary: string;
  status_working: string;
  status_idle: string;
  status_offline: string;
  glow: string;
  [key: string]: string;
}

export interface WidgetManifest {
  default: DefaultWidgetDescriptor[];
  team_specific: TeamSpecificWidgetDescriptor[];
}

export interface DefaultWidgetDescriptor {
  id: string;
  title: string;
  component: string;
  grid: GridPosition;
}

export interface TeamSpecificWidgetDescriptor {
  id: string;
  title: string;
  primitive: PrimitiveType;
  data_source: string;
  derived_from: string;
  config: Record<string, unknown>;
  grid: GridPosition;
}

export interface GridPosition {
  w: number;
  h: number;
  x?: number;
  y?: number;
}

export type PrimitiveType =
  | 'stat-card'
  | 'sparkline'
  | 'bar-chart'
  | 'table'
  | 'list'
  | 'status-grid'
  | 'timeline';

export interface ConnectivityConfig {
  skynet: SkynetConnectivity;
}

export interface SkynetConnectivity {
  ws_url: string;
  http_url: string;
  auth_token_ref: string;
}

/** Agent state as consumed by widgets */
export interface AgentState {
  id: string;
  name: string;
  role: string;
  model: string;
  status: 'working' | 'idle' | 'offline';
  emoji?: string;
  skills: string[];
  lastSeen?: string;
}

/** KPI metadata */
export interface KpiDefinition {
  id: string;
  name: string;
  category: KpiCategory;
  unit: string;
  description: string;
  data_source: string;
}

export type KpiCategory =
  | 'flow'
  | 'capacity'
  | 'runtime'
  | 'execution';

/** KPI value as returned by data hooks */
export interface KpiValue {
  id: string;
  value: number | string;
  delta?: number;
  trend?: number;
  recentValues?: number[];
  freshness: 'live' | 'stale' | 'mock';
  source: string;
}
