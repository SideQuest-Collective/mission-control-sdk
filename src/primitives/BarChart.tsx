export interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  orientation?: 'horizontal' | 'vertical';
  title?: string;
}

export function BarChart({ data, orientation = 'vertical', title }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      style={{
        padding: 'var(--mc-space-5, 20px)',
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-lg, 12px)',
        border: '1px solid var(--mc-border, #1e2536)',
      }}
    >
      {title && (
        <div
          style={{
            fontSize: 'var(--mc-text-h4, 0.9375rem)',
            fontWeight: 600,
            color: 'var(--mc-text-primary, #f0f2f7)',
            marginBottom: 'var(--mc-space-4, 16px)',
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: orientation === 'horizontal' ? 'column' : 'row',
          alignItems: orientation === 'horizontal' ? 'stretch' : 'flex-end',
          gap: 'var(--mc-space-2, 8px)',
          height: orientation === 'vertical' ? 120 : 'auto',
        }}
      >
        {data.map((item, i) => {
          const pct = (item.value / max) * 100;
          const barColor = item.color ?? `var(--mc-chart-${(i % 8) + 1}, var(--mc-primary, #3b82f6))`;

          if (orientation === 'horizontal') {
            return (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--mc-space-2, 8px)' }}>
                <div
                  style={{
                    width: 80,
                    fontSize: 'var(--mc-text-caption, 0.6875rem)',
                    color: 'var(--mc-text-secondary, #8b93a8)',
                    textAlign: 'right',
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 20,
                    background: 'var(--mc-surface-elevated, #121722)',
                    borderRadius: 'var(--mc-radius-xs, 3px)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: barColor,
                      borderRadius: 'var(--mc-radius-xs, 3px)',
                      transition: 'width var(--mc-transition-base, 200ms ease)',
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 'var(--mc-text-caption, 0.6875rem)',
                    color: 'var(--mc-text-tertiary, #5c6478)',
                    width: 40,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {item.value}
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 40,
                  height: `${pct}%`,
                  background: barColor,
                  borderRadius: 'var(--mc-radius-xs, 3px) var(--mc-radius-xs, 3px) 0 0',
                  transition: 'height var(--mc-transition-base, 200ms ease)',
                  minHeight: 2,
                }}
              />
              <div
                style={{
                  fontSize: 'var(--mc-text-caption, 0.6875rem)',
                  color: 'var(--mc-text-secondary, #8b93a8)',
                  marginTop: 'var(--mc-space-1, 4px)',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%',
                }}
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
