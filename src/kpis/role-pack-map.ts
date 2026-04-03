import type { KpiDefinition } from '../types.js';
import { KPI_REGISTRY } from './registry.js';

/** Maps role_pack names to the KPI IDs they surface */
export const ROLE_PACK_KPI_MAP: Record<string, string[]> = {
  development: [
    'cycle_time',
    'throughput',
    'completion_throughput',
    'blocked_age',
    'wip_by_owner',
    'tool_backed_runs',
    'verified_completions',
  ],
  review: [
    'review_wait',
    'reopen_rate',
    'cycle_time',
    'intent_only_runs',
    'silent_accepted_runs',
  ],
  architecture: [
    'owner_concentration',
    'wip_by_pod',
    'deadlock_escalations',
    'stale_lanes',
  ],
  operations: [
    'pickup_latency',
    'intervention_effectiveness',
    'no_signal_rate',
    'retarget_breaches',
  ],
  design: [
    'first_progress',
    'idle_with_work',
    'unassigned_backlog_age',
  ],
};

/** Returns the union of KPI definitions for a set of role packs */
export function getKpisForRolePacks(packs: string[]): KpiDefinition[] {
  const ids = new Set<string>();
  for (const pack of packs) {
    const kpiIds = ROLE_PACK_KPI_MAP[pack];
    if (kpiIds) {
      for (const id of kpiIds) {
        ids.add(id);
      }
    }
  }
  return KPI_REGISTRY.filter((kpi) => ids.has(kpi.id));
}
