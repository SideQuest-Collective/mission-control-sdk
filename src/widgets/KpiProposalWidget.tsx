import { useKpiProposals } from '../hooks/useKpiProposals.js';
import type { KpiProposalRecord } from '../kpis/types.js';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  team_voted: 'Team Voted',
  operator_pending: 'Awaiting Operator',
  approved: 'Approved',
  active: 'Active',
  rejected: 'Rejected',
  expired: 'Expired',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--mc-status-warning, #eab308)',
  team_voted: 'var(--mc-chart-3, #3b82f6)',
  operator_pending: 'var(--mc-accent, #a78bfa)',
  approved: 'var(--mc-status-success, #22c55e)',
  active: 'var(--mc-status-success, #22c55e)',
  rejected: 'var(--mc-status-error, #ef4444)',
  expired: 'var(--mc-text-tertiary, #5c6478)',
};

function ProposalCard({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: KpiProposalRecord;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { kpi, pipeline, reason } = proposal.proposal;
  const canVote = ['pending', 'team_voted', 'operator_pending'].includes(proposal.status);

  return (
    <div
      style={{
        padding: 'var(--mc-space-4, 16px)',
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-md, 8px)',
        border: '1px solid var(--mc-border, #1e2536)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--mc-space-3, 12px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--mc-text-body, 0.8125rem)',
              fontWeight: 600,
              color: 'var(--mc-text-primary, #f0f2f7)',
            }}
          >
            {kpi.name}
          </div>
          <div
            style={{
              fontSize: 'var(--mc-text-caption, 0.6875rem)',
              color: 'var(--mc-text-secondary, #8b93a8)',
              marginTop: '2px',
            }}
          >
            {kpi.description}
          </div>
        </div>
        {/* Status badge */}
        <span
          style={{
            fontSize: 'var(--mc-text-caption, 0.6875rem)',
            padding: '2px 8px',
            borderRadius: 'var(--mc-radius-full, 9999px)',
            background: STATUS_COLORS[proposal.status] ?? 'var(--mc-text-tertiary)',
            color: '#000',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            marginLeft: '8px',
          }}
        >
          {STATUS_LABELS[proposal.status] ?? proposal.status}
        </span>
      </div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--mc-space-2, 8px)',
          fontSize: 'var(--mc-text-caption, 0.6875rem)',
          color: 'var(--mc-text-tertiary, #5c6478)',
        }}
      >
        <span>{kpi.scope === 'agent' ? 'Agent' : 'Team'} scope</span>
        <span>&middot;</span>
        <span>{kpi.category}</span>
        <span>&middot;</span>
        <span>
          {pipeline.aggregation.type} over {pipeline.window}
        </span>
        {kpi.agent_id && (
          <>
            <span>&middot;</span>
            <span>by {kpi.agent_id}</span>
          </>
        )}
      </div>

      {/* Replaces badge */}
      {proposal.replaces_kpi_id && (
        <div
          style={{
            fontSize: 'var(--mc-text-caption, 0.6875rem)',
            padding: '2px 8px',
            borderRadius: 'var(--mc-radius-sm, 4px)',
            background: 'var(--mc-surface-elevated, #121722)',
            border: '1px solid var(--mc-border, #1e2536)',
            color: 'var(--mc-text-secondary, #8b93a8)',
            alignSelf: 'flex-start',
          }}
        >
          Replaces: {proposal.replaces_kpi_id}
        </div>
      )}

      {/* Reason */}
      <div
        style={{
          fontSize: 'var(--mc-text-caption, 0.6875rem)',
          color: 'var(--mc-text-secondary, #8b93a8)',
          fontStyle: 'italic',
        }}
      >
        &ldquo;{reason}&rdquo;
      </div>

      {/* Action buttons */}
      {canVote && (
        <div style={{ display: 'flex', gap: 'var(--mc-space-2, 8px)' }}>
          <button
            onClick={onApprove}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 'var(--mc-radius-md, 8px)',
              border: 'none',
              background: 'var(--mc-status-success, #22c55e)',
              color: '#000',
              fontSize: 'var(--mc-text-caption, 0.6875rem)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Approve
          </button>
          <button
            onClick={onReject}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 'var(--mc-radius-md, 8px)',
              border: '1px solid var(--mc-status-error, #ef4444)',
              background: 'transparent',
              color: 'var(--mc-status-error, #ef4444)',
              fontSize: 'var(--mc-text-caption, 0.6875rem)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export function KpiProposalWidget() {
  const { proposals, capacity, loading, error, vote } = useKpiProposals();

  const pending = proposals.filter((p) =>
    ['pending', 'team_voted', 'operator_pending'].includes(p.status),
  );

  const recentlyActivated = proposals.filter((p) => {
    if (p.status !== 'approved' && p.status !== 'active' && p.resolved_at == null) return false;
    const resolved = p.resolved_at ? new Date(p.resolved_at).getTime() : 0;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return resolved >= sevenDaysAgo;
  });

  // Capacity meter
  const capacityBar = capacity && (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--mc-space-3, 12px)',
        padding: 'var(--mc-space-3, 12px) var(--mc-space-4, 16px)',
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-md, 8px)',
        border: '1px solid var(--mc-border, #1e2536)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--mc-text-caption, 0.6875rem)',
          color: 'var(--mc-text-secondary, #8b93a8)',
          whiteSpace: 'nowrap',
        }}
      >
        {capacity.active}/{capacity.max} dynamic KPIs active
      </div>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: 'var(--mc-surface-elevated, #121722)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${(capacity.active / capacity.max) * 100}%`,
            height: '100%',
            borderRadius: 3,
            background:
              capacity.remaining === 0
                ? 'var(--mc-status-error, #ef4444)'
                : 'var(--mc-accent, #a78bfa)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );

  // Collapsed state: no pending proposals
  if (pending.length === 0 && !loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mc-space-2, 8px)' }}>
        {capacityBar}
        {recentlyActivated.length > 0 && (
          <div
            style={{
              padding: 'var(--mc-space-3, 12px) var(--mc-space-4, 16px)',
              background: 'var(--mc-surface-raised, #0c1019)',
              borderRadius: 'var(--mc-radius-md, 8px)',
              border: '1px solid var(--mc-border, #1e2536)',
              fontSize: 'var(--mc-text-caption, 0.6875rem)',
              color: 'var(--mc-status-success, #22c55e)',
            }}
          >
            {recentlyActivated.length} KPI{recentlyActivated.length !== 1 ? 's' : ''} activated in
            the last 7 days
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          padding: 'var(--mc-space-6, 24px)',
          textAlign: 'center',
          color: 'var(--mc-text-secondary, #8b93a8)',
          fontSize: 'var(--mc-text-body, 0.8125rem)',
        }}
      >
        Loading proposals...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 'var(--mc-space-6, 24px)',
          textAlign: 'center',
          color: 'var(--mc-status-error, #ef4444)',
          fontSize: 'var(--mc-text-body, 0.8125rem)',
        }}
      >
        Failed to load proposals
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mc-space-3, 12px)' }}>
      {capacityBar}

      {/* Pending proposals */}
      {pending.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          onApprove={() => void vote(p.id, 'approve')}
          onReject={() => void vote(p.id, 'reject')}
        />
      ))}

      {/* Recently activated summary */}
      {recentlyActivated.length > 0 && (
        <div
          style={{
            padding: 'var(--mc-space-3, 12px) var(--mc-space-4, 16px)',
            background: 'var(--mc-surface-raised, #0c1019)',
            borderRadius: 'var(--mc-radius-md, 8px)',
            border: '1px solid var(--mc-border, #1e2536)',
            fontSize: 'var(--mc-text-caption, 0.6875rem)',
            color: 'var(--mc-status-success, #22c55e)',
          }}
        >
          {recentlyActivated.length} KPI{recentlyActivated.length !== 1 ? 's' : ''} activated in
          the last 7 days
        </div>
      )}
    </div>
  );
}
