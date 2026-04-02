import type { ReactNode } from 'react';

export interface StatCardProps {
  value: ReactNode;
  label: string;
  delta?: number;
  unit?: string;
  className?: string;
}

export function StatCard({ value, label, delta, unit, className }: StatCardProps) {
  const formattedValue = unit ? `${value}${unit}` : value;

  return (
    <div
      className={className}
      style={{
        padding: 'var(--mc-space-5, 20px)',
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-lg, 12px)',
        border: '1px solid var(--mc-border, #1e2536)',
      }}
    >
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
      {delta !== undefined && (
        <div
          style={{
            fontSize: 'var(--mc-text-body-sm, 0.75rem)',
            color:
              delta > 0
                ? 'var(--mc-status-success, #22c55e)'
                : delta < 0
                  ? 'var(--mc-status-error, #ef4444)'
                  : 'var(--mc-text-tertiary, #5c6478)',
            marginTop: 'var(--mc-space-1, 4px)',
            fontWeight: 500,
          }}
        >
          {delta > 0 ? '+' : ''}
          {delta}%
        </div>
      )}
    </div>
  );
}
