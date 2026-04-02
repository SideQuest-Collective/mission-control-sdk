import type { AgentState } from '../types.js';
import { useAgents } from '../hooks/index.js';

const statusColors: Record<AgentState['status'], string> = {
  working: 'var(--mc-status-success, #22c55e)',
  idle: 'var(--mc-status-warning, #eab308)',
  offline: 'var(--mc-status-error, #ef4444)',
};

export function AgentListWidget() {
  const { agents } = useAgents();

  if (agents.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--mc-space-6, 24px)',
          textAlign: 'center',
          color: 'var(--mc-text-secondary, #8b93a8)',
          fontSize: 'var(--mc-text-body, 0.8125rem)',
        }}
      >
        No agents in roster
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mc-space-2, 8px)' }}>
      {agents.map((agent) => (
        <div
          key={agent.id}
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
          {/* Avatar / Emoji */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--mc-radius-full, 9999px)',
              background: 'var(--mc-surface-elevated, #121722)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.125rem',
              flexShrink: 0,
            }}
          >
            {agent.emoji ?? agent.name.charAt(0).toUpperCase()}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--mc-text-body, 0.8125rem)',
                fontWeight: 600,
                color: 'var(--mc-text-primary, #f0f2f7)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {agent.name}
            </div>
            <div
              style={{
                fontSize: 'var(--mc-text-caption, 0.6875rem)',
                color: 'var(--mc-text-tertiary, #5c6478)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {agent.role} &middot; {agent.model}
            </div>
          </div>

          {/* Status dot */}
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: statusColors[agent.status],
              flexShrink: 0,
              boxShadow:
                agent.status === 'working'
                  ? '0 0 6px var(--mc-status-success, #22c55e)'
                  : 'none',
            }}
            title={agent.status}
          />
        </div>
      ))}
    </div>
  );
}
