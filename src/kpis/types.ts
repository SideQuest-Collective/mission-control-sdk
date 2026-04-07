import type { KpiDefinition, KpiCategory, TeamSpecificWidgetDescriptor } from '../types.js';

// ── Pipeline descriptor types (local copies — contracts/ has the canonical version) ──

export const TELEMETRY_FAMILIES = [
  'session.started',
  'session.updated',
  'session.ended',
  'usage.delta',
  'context.updated',
  'run.started',
  'run.ended',
  'run.failed',
  'cost.estimated',
  'cost.billed',
  'system.event',
] as const;

export type TelemetryFamily = typeof TELEMETRY_FAMILIES[number];

export const PIPELINE_WINDOWS = ['1h', '6h', '24h', '7d'] as const;
export type PipelineWindow = typeof PIPELINE_WINDOWS[number];

export const PIPELINE_OUTPUT_UNITS = ['count', 'percent', 'hours', 'ms'] as const;
export type PipelineOutputUnit = typeof PIPELINE_OUTPUT_UNITS[number];

export interface PipelineSource {
  family: TelemetryFamily;
  filter?: Record<string, string>;
}

export type AggregationType =
  | { type: 'count' }
  | { type: 'count_where'; predicate: Record<string, string> }
  | { type: 'avg'; field: string }
  | { type: 'sum'; field: string }
  | { type: 'p50'; field: string }
  | { type: 'p90'; field: string }
  | { type: 'max'; field: string }
  | { type: 'min'; field: string }
  | { type: 'rate'; numerator: AggregationType; denominator: AggregationType };

export interface PipelineDescriptor {
  version: 1;
  sources: [PipelineSource];
  aggregation: AggregationType;
  window: PipelineWindow;
  output_unit: PipelineOutputUnit;
}

// ── KPI Proposal types ──

export interface KpiProposal {
  kpi: {
    id: string;
    name: string;
    category: KpiCategory;
    unit: string;
    scope: 'team' | 'agent';
    agent_id?: string;
    description: string;
  };
  pipeline: PipelineDescriptor;
  proposed_by?: string;
  replaces?: string;
  reason: string;
}

export interface KpiProposalRecord {
  id: string;
  team_slug: string;
  proposal: KpiProposal;
  status:
    | 'pending'
    | 'team_voted'
    | 'operator_pending'
    | 'approved'
    | 'active'
    | 'rejected'
    | 'expired';
  replaces_kpi_id?: string;
  created_at: string;
  resolved_at?: string;
  expires_at: string;
}

export interface KpiProposalVote {
  proposal_id: string;
  voter_id: string;
  voter_type: 'agent' | 'operator';
  vote: 'approve' | 'reject';
  reason?: string;
  voted_at: string;
}

// ── Active KPI ──

export interface ActiveKpi {
  id: string;
  team_slug: string;
  kpi_definition: KpiDefinition;
  pipeline: PipelineDescriptor;
  widget_descriptor: TeamSpecificWidgetDescriptor;
  origin: 'bootstrap_llm' | 'runtime_agent';
  proposed_by?: string;
  activated_at: string;
}

// ── KPI Catalog ──

export interface KpiCatalogEntry {
  id: string;
  team_slug: string;
  kpi_definition: KpiDefinition;
  pipeline: PipelineDescriptor;
  origin: 'bootstrap_llm' | 'runtime_agent';
  proposed_by?: string;
  first_registered: string;
  last_active: string;
  times_bootstrapped: number;
  replaced_by?: string;
  status: 'active' | 'archived' | 'rejected';
}

export type { KpiDefinition, KpiCategory };
