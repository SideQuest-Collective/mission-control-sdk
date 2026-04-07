import type { PipelineDescriptor } from './types.js';

/**
 * Maps each of the 22 static KPIs to a PipelineDescriptor so they can be
 * evaluated by the KpiProjectionEngine against real telemetry events.
 *
 * Mapping rules (from the plan):
 *   data_source=productivity_events → family: system.event, filter type
 *   data_source=execution           → family: run.ended (or run.started)
 *   data_source=queue               → family: system.event, filter type=queue_snapshot
 *   data_source=github              → family: system.event, filter type=github_webhook
 *
 * Filter keys and aggregation field paths resolve from event.payload first,
 * then fall back to top-level event fields for telemetry identifiers such as
 * agent/session metadata.
 */

export const STATIC_PIPELINE_MAP: Record<string, PipelineDescriptor> = {
  // ── Flow ──────────────────────────────────────────────────────────────

  pickup_latency: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'task_assigned' } }],
    aggregation: { type: 'p50', field: 'pickup_latency_hours' },
    window: '7d',
    output_unit: 'hours',
  },

  first_progress: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'task_progress' } }],
    aggregation: { type: 'p50', field: 'first_progress_hours' },
    window: '7d',
    output_unit: 'hours',
  },

  review_wait: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'github_webhook' } }],
    aggregation: { type: 'p50', field: 'review_wait_hours' },
    window: '7d',
    output_unit: 'hours',
  },

  cycle_time: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'task_completed' } }],
    aggregation: { type: 'p50', field: 'cycle_time_hours' },
    window: '7d',
    output_unit: 'hours',
  },

  blocked_age: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'queue_snapshot' } }],
    aggregation: { type: 'p50', field: 'blocked_age_hours' },
    window: '24h',
    output_unit: 'hours',
  },

  throughput: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'task_completed' } }],
    aggregation: { type: 'count' },
    window: '24h',
    output_unit: 'count',
  },

  completion_throughput: {
    version: 1,
    sources: [{ family: 'run.ended' }],
    aggregation: {
      type: 'count_where',
      predicate: { verified: 'true', tool_backed: 'true' },
    },
    window: '24h',
    output_unit: 'count',
  },

  reopen_rate: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'task_reopened' } }],
    aggregation: {
      type: 'rate',
      numerator: { type: 'count' },
      denominator: { type: 'count' },
    },
    window: '7d',
    output_unit: 'percent',
  },

  // ── Capacity ──────────────────────────────────────────────────────────

  wip_by_owner: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'queue_snapshot' } }],
    aggregation: { type: 'sum', field: 'wip_count' },
    window: '1h',
    output_unit: 'count',
  },

  wip_by_pod: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'queue_snapshot' } }],
    aggregation: { type: 'sum', field: 'pod_wip_count' },
    window: '1h',
    output_unit: 'count',
  },

  idle_with_work: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'queue_snapshot' } }],
    aggregation: {
      type: 'count_where',
      predicate: { agent_idle: 'true', queue_non_empty: 'true' },
    },
    window: '1h',
    output_unit: 'count',
  },

  owner_concentration: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'queue_snapshot' } }],
    aggregation: { type: 'avg', field: 'herfindahl_index' },
    window: '24h',
    output_unit: 'percent',
  },

  unassigned_backlog_age: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'queue_snapshot' } }],
    aggregation: { type: 'max', field: 'unassigned_age_hours' },
    window: '24h',
    output_unit: 'hours',
  },

  // ── Runtime ───────────────────────────────────────────────────────────

  intervention_effectiveness: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'intervention_resolved' } }],
    aggregation: {
      type: 'rate',
      numerator: { type: 'count_where', predicate: { resolved: 'true' } },
      denominator: { type: 'count' },
    },
    window: '7d',
    output_unit: 'percent',
  },

  no_signal_rate: {
    version: 1,
    sources: [{ family: 'run.ended' }],
    aggregation: {
      type: 'rate',
      numerator: { type: 'count_where', predicate: { signal: 'none' } },
      denominator: { type: 'count' },
    },
    window: '24h',
    output_unit: 'percent',
  },

  stale_lanes: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'queue_snapshot' } }],
    aggregation: {
      type: 'count_where',
      predicate: { lane_stale: 'true' },
    },
    window: '24h',
    output_unit: 'count',
  },

  deadlock_escalations: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'deadlock_escalation' } }],
    aggregation: { type: 'count' },
    window: '7d',
    output_unit: 'count',
  },

  retarget_breaches: {
    version: 1,
    sources: [{ family: 'system.event', filter: { type: 'retarget_breach' } }],
    aggregation: { type: 'count' },
    window: '7d',
    output_unit: 'count',
  },

  // ── Execution ─────────────────────────────────────────────────────────

  tool_backed_runs: {
    version: 1,
    sources: [{ family: 'run.ended' }],
    aggregation: {
      type: 'count_where',
      predicate: { tool_invocations_gt_0: 'true' },
    },
    window: '24h',
    output_unit: 'count',
  },

  verified_completions: {
    version: 1,
    sources: [{ family: 'run.ended' }],
    aggregation: {
      type: 'count_where',
      predicate: { verified: 'true', tool_backed: 'true' },
    },
    window: '24h',
    output_unit: 'count',
  },

  intent_only_runs: {
    version: 1,
    sources: [{ family: 'run.ended' }],
    aggregation: {
      type: 'count_where',
      predicate: { has_intent: 'true', has_lifecycle: 'false' },
    },
    window: '24h',
    output_unit: 'count',
  },

  silent_accepted_runs: {
    version: 1,
    sources: [{ family: 'run.ended' }],
    aggregation: {
      type: 'count_where',
      predicate: { accepted: 'true', meaningful_work: 'false' },
    },
    window: '24h',
    output_unit: 'count',
  },
};

/** Look up the pipeline descriptor for a static KPI by ID. Returns null if not found. */
export function getStaticPipelineDescriptor(kpiId: string): PipelineDescriptor | null {
  return STATIC_PIPELINE_MAP[kpiId] ?? null;
}
