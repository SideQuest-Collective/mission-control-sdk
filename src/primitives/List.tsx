export interface ListItem {
  id: string;
  label: string;
  status?: 'success' | 'warning' | 'error' | 'info';
  detail?: string;
}

export interface ListProps {
  items: ListItem[];
}

const statusColorMap: Record<string, string> = {
  success: 'var(--mc-status-success, #22c55e)',
  warning: 'var(--mc-status-warning, #eab308)',
  error: 'var(--mc-status-error, #ef4444)',
  info: 'var(--mc-status-info, #3b82f6)',
};

export function List({ items }: ListProps) {
  return (
    <div
      style={{
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-lg, 12px)',
        border: '1px solid var(--mc-border, #1e2536)',
        overflow: 'hidden',
      }}
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--mc-space-3, 12px)',
            padding: 'var(--mc-space-3, 12px) var(--mc-space-4, 16px)',
            borderBottom:
              i < items.length - 1 ? '1px solid var(--mc-border-subtle, #151b28)' : 'none',
          }}
        >
          {item.status && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColorMap[item.status] ?? 'var(--mc-text-tertiary, #5c6478)',
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--mc-text-body, 0.8125rem)',
                color: 'var(--mc-text-primary, #f0f2f7)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </div>
            {item.detail && (
              <div
                style={{
                  fontSize: 'var(--mc-text-caption, 0.6875rem)',
                  color: 'var(--mc-text-tertiary, #5c6478)',
                  marginTop: 'var(--mc-space-0_5, 2px)',
                }}
              >
                {item.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
