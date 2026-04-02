export interface StatusCell {
  value: string;
  color: string;
}

export interface StatusGridProps {
  rows: string[];
  columns: string[];
  cells: StatusCell[][];
}

export function StatusGrid({ rows, columns, cells }: StatusGridProps) {
  return (
    <div
      style={{
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-lg, 12px)',
        border: '1px solid var(--mc-border, #1e2536)',
        overflow: 'auto',
        padding: 'var(--mc-space-4, 16px)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th />
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  padding: 'var(--mc-space-1, 4px) var(--mc-space-2, 8px)',
                  fontSize: 'var(--mc-text-caption, 0.6875rem)',
                  fontWeight: 600,
                  color: 'var(--mc-text-tertiary, #5c6478)',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row}>
              <td
                style={{
                  padding: 'var(--mc-space-1, 4px) var(--mc-space-2, 8px)',
                  fontSize: 'var(--mc-text-caption, 0.6875rem)',
                  fontWeight: 600,
                  color: 'var(--mc-text-secondary, #8b93a8)',
                  whiteSpace: 'nowrap',
                }}
              >
                {row}
              </td>
              {columns.map((col, ci) => {
                const cell = cells[ri]?.[ci];
                return (
                  <td
                    key={col}
                    style={{
                      padding: 'var(--mc-space-1, 4px)',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: 'var(--mc-radius-sm, 5px)',
                        background: cell ? cell.color : 'var(--mc-surface-elevated, #121722)',
                        fontSize: 'var(--mc-text-caption, 0.6875rem)',
                        fontWeight: 600,
                        color: 'var(--mc-text-primary, #f0f2f7)',
                      }}
                      title={cell?.value}
                    >
                      {cell?.value ?? ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
