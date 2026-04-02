import type { ReactNode } from 'react';

export interface SparklineProps {
  value: ReactNode;
  label: string;
  data: number[];
  delta?: number;
  unit?: string;
  color?: string;
}

function generatePoints(data: number[], width: number, height: number): string {
  if (data.length === 0) return `0,${height / 2} ${width},${height / 2}`;
  const max = Math.max(...data, 1);
  const step = width / Math.max(data.length - 1, 1);
  return data
    .map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height * 0.85);
      return `${x},${y}`;
    })
    .join(' ');
}

export function Sparkline({ value, label, data, delta, unit, color }: SparklineProps) {
  const lineColor = color ?? 'var(--mc-primary, #3b82f6)';
  const formattedValue = unit ? `${value}${unit}` : value;

  return (
    <div
      style={{
        padding: 'var(--mc-space-5, 20px)',
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-lg, 12px)',
        border: '1px solid var(--mc-border, #1e2536)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--mc-space-2, 8px)' }}>
        <div
          style={{
            fontSize: 'var(--mc-text-kpi, 2rem)',
            fontWeight: 700,
            color: 'var(--mc-text-primary, #f0f2f7)',
            lineHeight: 1.1,
            fontFamily: 'var(--mc-font-display, sans-serif)',
          }}
        >
          {formattedValue}
        </div>
        {delta !== undefined && (
          <span
            style={{
              fontSize: 'var(--mc-text-body-sm, 0.75rem)',
              color:
                delta > 0
                  ? 'var(--mc-status-success, #22c55e)'
                  : delta < 0
                    ? 'var(--mc-status-error, #ef4444)'
                    : 'var(--mc-text-tertiary, #5c6478)',
              fontWeight: 500,
            }}
          >
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 'var(--mc-text-label, 0.75rem)',
          color: 'var(--mc-text-secondary, #8b93a8)',
          marginTop: 'var(--mc-space-1, 4px)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        style={{
          width: '100%',
          height: 32,
          marginTop: 'var(--mc-space-3, 12px)',
          display: 'block',
        }}
        aria-label={`${label} trend`}
      >
        <polyline
          points={generatePoints(data, 100, 30)}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
