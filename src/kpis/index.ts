export { KPI_REGISTRY } from './registry.js';
export { ROLE_PACK_KPI_MAP, getKpisForRolePacks } from './role-pack-map.js';
export { SlidingWindow, parseDuration } from './sliding-window.js';
export { aggregate } from './aggregators.js';
export { KpiProjection } from './projection.js';
export { KpiProjectionEngine } from './projection-engine.js';
export {
  createKpiRuntimeStore,
  buildKpiBootstrapStatements,
} from './kpi-runtime-store.js';
export type { KpiRuntimeStore } from './kpi-runtime-store.js';
export type {
  PipelineDescriptor,
  PipelineSource,
  AggregationType,
  TelemetryFamily,
  KpiProposal,
  KpiProposalRecord,
  KpiProposalVote,
  ActiveKpi,
  KpiCatalogEntry,
} from './types.js';
