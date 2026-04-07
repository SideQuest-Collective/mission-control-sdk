import { useState } from 'react';
import { useKpiProposals } from '../hooks/useKpiProposals.js';
import { useManifest } from '../hooks/useManifest.js';
import type { ActiveKpi, KpiProposalRecord, KpiProposalVote } from '../kpis/types.js';

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

function summarizeVotes(votes: KpiProposalVote[], rosterSize: number) {
  const approvedAgents = votes.filter((vote) => vote.voter_type === 'agent' && vote.vote === 'approve').length;
  const operatorApproved = votes.some((vote) => vote.voter_type === 'operator' && vote.vote === 'approve');
  const quorum = Math.floor(rosterSize / 2) + 1;
  const progress = rosterSize > 0 ? Math.min(100, (approvedAgents / rosterSize) * 100) : 0;

  return {
    approvedAgents,
    operatorApproved,
    quorum,
    progress,
  };
}

function ProposalCard({
  proposal,
  votes,
  rosterSize,
  capacityRemaining,
  activeKpis,
  canModerate,
  replacementId,
  onReplacementChange,
  onApprove,
  onReject,
}: {
  proposal: KpiProposalRecord;
  votes: KpiProposalVote[];
  rosterSize: number;
  capacityRemaining: number | null;
  activeKpis: ActiveKpi[];
  canModerate: boolean;
  replacementId: string;
  onReplacementChange: (replacementId: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { kpi, pipeline, reason } = proposal.proposal;
  const canVote = ['pending', 'team_voted', 'operator_pending'].includes(proposal.status);
  const voteSummary = summarizeVotes(votes, rosterSize);
  const requiresReplacementSelection =
    canVote &&
    proposal.replaces_kpi_id == null &&
    capacityRemaining === 0 &&
    activeKpis.length > 0;

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
        <span>&middot;</span>
        <span>Proposed by {proposal.proposal.proposed_by ?? kpi.agent_id ?? 'unknown'}</span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '10px 12px',
          borderRadius: 'var(--mc-radius-sm, 6px)',
          background: 'var(--mc-surface-elevated, #121722)',
          border: '1px solid var(--mc-border, #1e2536)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--mc-text-caption, 0.6875rem)',
            color: 'var(--mc-text-secondary, #8b93a8)',
          }}
        >
          <span>{voteSummary.approvedAgents}/{rosterSize} agents approved</span>
          <span>{voteSummary.operatorApproved ? 'Operator approved' : 'Operator pending'}</span>
        </div>
        <div
          style={{
            width: '100%',
            height: 6,
            borderRadius: 9999,
            background: 'var(--mc-surface, #0f1118)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${voteSummary.progress}%`,
              height: '100%',
              background: 'var(--mc-accent, #a78bfa)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 'var(--mc-text-caption, 0.6875rem)',
            color: 'var(--mc-text-tertiary, #5c6478)',
          }}
        >
          Team quorum requires {voteSummary.quorum} approvals.
        </div>
      </div>

      {(proposal.replaces_kpi_id || requiresReplacementSelection) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--mc-text-caption, 0.6875rem)',
              color: 'var(--mc-text-secondary, #8b93a8)',
            }}
          >
            Replacement KPI
          </div>
          {proposal.replaces_kpi_id ? (
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
          ) : (
            <select
              value={replacementId}
              onChange={(event) => onReplacementChange(event.target.value)}
              style={{
                width: '100%',
                borderRadius: 'var(--mc-radius-sm, 6px)',
                border: '1px solid var(--mc-border, #1e2536)',
                background: 'var(--mc-background, #0a0d14)',
                color: 'var(--mc-text-primary, #f0f2f7)',
                padding: '8px 10px',
                fontSize: 'var(--mc-text-caption, 0.6875rem)',
              }}
            >
              <option value="">Select KPI to replace</option>
              {activeKpis.map((activeKpi) => (
                <option key={activeKpi.id} value={activeKpi.id}>
                  {activeKpi.kpi_definition.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div
        style={{
          fontSize: 'var(--mc-text-caption, 0.6875rem)',
          color: 'var(--mc-text-secondary, #8b93a8)',
          fontStyle: 'italic',
        }}
      >
        &ldquo;{reason}&rdquo;
      </div>

      {canVote && canModerate && (
        <div style={{ display: 'flex', gap: 'var(--mc-space-2, 8px)' }}>
          <button
            onClick={onApprove}
            disabled={requiresReplacementSelection && replacementId === ''}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 'var(--mc-radius-md, 8px)',
              border: 'none',
              background: 'var(--mc-status-success, #22c55e)',
              color: '#000',
              fontSize: 'var(--mc-text-caption, 0.6875rem)',
              fontWeight: 600,
              cursor: requiresReplacementSelection && replacementId === '' ? 'not-allowed' : 'pointer',
              opacity: requiresReplacementSelection && replacementId === '' ? 0.6 : 1,
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

      {canVote && !canModerate && (
        <div
          style={{
            fontSize: 'var(--mc-text-caption, 0.6875rem)',
            color: 'var(--mc-text-tertiary, #5c6478)',
          }}
        >
          Approval actions require authenticated API access.
        </div>
      )}
    </div>
  );
}

export function KpiProposalWidget() {
  const { team } = useManifest();
  const {
    proposals,
    proposalDetails,
    activeKpis,
    capacity,
    canModerate,
    loading,
    error,
    vote,
  } = useKpiProposals();
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({});

  const pending = proposals.filter((proposal) =>
    ['pending', 'team_voted', 'operator_pending'].includes(proposal.status),
  );

  const recentlyActivated = proposals.filter((proposal) => {
    if (proposal.status !== 'approved' && proposal.status !== 'active' && proposal.resolved_at == null) {
      return false;
    }
    const resolved = proposal.resolved_at ? new Date(proposal.resolved_at).getTime() : 0;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return resolved >= sevenDaysAgo;
  });

  const rosterSize = team?.roster?.length ?? 0;

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

      {pending.map((proposal) => {
        const detail = proposalDetails[proposal.id];
        const replacementId = replacementSelections[proposal.id] ?? '';

        return (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            votes={detail?.votes ?? []}
            rosterSize={rosterSize}
            capacityRemaining={capacity?.remaining ?? null}
            activeKpis={activeKpis.filter((activeKpi) => activeKpi.id !== proposal.proposal.kpi.id)}
            canModerate={canModerate}
            replacementId={replacementId}
            onReplacementChange={(value) => {
              setReplacementSelections((current) => ({ ...current, [proposal.id]: value }));
            }}
            onApprove={() => void vote(proposal.id, 'approve', replacementId ? { replaces: replacementId } : undefined)}
            onReject={() => void vote(proposal.id, 'reject')}
          />
        );
      })}

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
