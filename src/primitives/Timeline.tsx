export interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  detail?: string;
  type?: string;
}

export interface TimelineProps {
  events: TimelineEvent[];
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export function Timeline({ events }: TimelineProps) {
  return (
    <div
      style={{
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-lg, 12px)',
        border: '1px solid var(--mc-border, #1e2536)',
        padding: 'var(--mc-space-4, 16px)',
      }}
    >
      {events.map((event, i) => (
        <div
          key={event.id}
          style={{
            display: 'flex',
            gap: 'var(--mc-space-3, 12px)',
            paddingBottom: i < events.length - 1 ? 'var(--mc-space-4, 16px)' : 0,
            position: 'relative',
          }}
        >
          {/* Vertical line connector */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 12,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--mc-primary, #3b82f6)',
                marginTop: 4,
                flexShrink: 0,
              }}
            />
            {i < events.length - 1 && (
              <div
                style={{
                  width: 1,
                  flex: 1,
                  background: 'var(--mc-border, #1e2536)',
                  marginTop: 4,
                }}
              />
            )}
          </div>
          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 'var(--mc-space-2, 8px)',
              }}
            >
              <div
                style={{
                  fontSize: 'var(--mc-text-body, 0.8125rem)',
                  color: 'var(--mc-text-primary, #f0f2f7)',
                  fontWeight: 500,
                }}
              >
                {event.title}
              </div>
              <div
                style={{
                  fontSize: 'var(--mc-text-caption, 0.6875rem)',
                  color: 'var(--mc-text-tertiary, #5c6478)',
                  flexShrink: 0,
                }}
              >
                {formatTimestamp(event.timestamp)}
              </div>
            </div>
            {event.detail && (
              <div
                style={{
                  fontSize: 'var(--mc-text-caption, 0.6875rem)',
                  color: 'var(--mc-text-secondary, #8b93a8)',
                  marginTop: 'var(--mc-space-0_5, 2px)',
                }}
              >
                {event.detail}
              </div>
            )}
            {event.type && (
              <div
                style={{
                  display: 'inline-block',
                  fontSize: 'var(--mc-text-caption, 0.6875rem)',
                  color: 'var(--mc-accent, #6366f1)',
                  background: 'var(--mc-accent-muted, rgba(99, 102, 241, 0.12))',
                  borderRadius: 'var(--mc-radius-sm, 5px)',
                  padding: '1px 6px',
                  marginTop: 'var(--mc-space-1, 4px)',
                }}
              >
                {event.type}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
