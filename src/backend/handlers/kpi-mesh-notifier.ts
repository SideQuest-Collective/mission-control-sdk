import type { KpiProposalRecord } from '../../kpis/types.js';

/**
 * Broadcasts a KPI proposal notification to all team agents via the Skynet /mesh/send endpoint.
 *
 * Format follows the plan spec: [KPI-PROPOSAL::{proposal_id}] with KPI details and vote URL.
 */
export async function broadcastKpiProposal(
  proposal: KpiProposalRecord,
  skynetUrl: string,
  gatewayToken: string,
): Promise<void> {
  const kpi = proposal.proposal.kpi;
  const pipeline = proposal.proposal.pipeline;

  const aggregationDesc = formatAggregation(pipeline.aggregation);
  const sourceDesc = pipeline.sources
    .map((s) => {
      const filterParts = s.filter
        ? Object.entries(s.filter).map(([k, v]) => `${k}=${v}`).join(', ')
        : '';
      return filterParts ? `${s.family} WHERE ${filterParts}` : s.family;
    })
    .join(', ');

  const message = [
    `[KPI-PROPOSAL::${proposal.id}] Agent "${kpi.agent_id ?? 'unknown'}" proposes new KPI:`,
    `  Name: ${kpi.name}`,
    `  Scope: ${kpi.scope}${kpi.agent_id ? ` (${kpi.agent_id})` : ''}`,
    `  Description: ${kpi.description}`,
    `  Pipeline: ${aggregationDesc}(${sourceDesc}) over ${pipeline.window}`,
    `  Proposal ID: ${proposal.id}`,
    `  `,
    `  Vote at: POST /api/kpis/proposals/${proposal.id}/vote`,
    `  Body: { "vote": "approve" | "reject", "voter_id": "<your-id>", "reason": "..." }`,
  ].join('\n');

  const url = `${skynetUrl.replace(/\/$/, '')}/mesh/send`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({
      to: null, // broadcast to all agents
      message,
      correlation_id: `kpi-proposal-${proposal.id}`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Mesh broadcast failed (${response.status}): ${text}`);
  }
}

function formatAggregation(agg: any): string {
  if (!agg || !agg.type) return 'unknown';
  switch (agg.type) {
    case 'count':
      return 'count';
    case 'count_where':
      return `count_where(${JSON.stringify(agg.predicate ?? {})})`;
    case 'avg':
    case 'sum':
    case 'p50':
    case 'p90':
    case 'max':
    case 'min':
      return `${agg.type}(${agg.field})`;
    case 'rate':
      return `rate(${formatAggregation(agg.numerator)} / ${formatAggregation(agg.denominator)})`;
    default:
      return agg.type;
  }
}
