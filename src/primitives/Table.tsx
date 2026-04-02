import { useState, useCallback } from 'react';

export interface TableColumn {
  key: string;
  header: string;
  width?: string;
}

export interface TableProps {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  sortable?: boolean;
}

export function Table({ columns, rows, sortable = false }: TableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = useCallback(
    (key: string) => {
      if (!sortable) return;
      if (sortKey === key) {
        setSortAsc((prev) => !prev);
      } else {
        setSortKey(key);
        setSortAsc(true);
      }
    },
    [sortable, sortKey],
  );

  const sortedRows =
    sortable && sortKey
      ? [...rows].sort((a, b) => {
          const aVal = a[sortKey];
          const bVal = b[sortKey];
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
          return sortAsc ? cmp : -cmp;
        })
      : rows;

  const thStyle = {
    padding: 'var(--mc-space-2, 8px) var(--mc-space-3, 12px)',
    textAlign: 'left' as const,
    fontSize: 'var(--mc-text-caption, 0.6875rem)',
    fontWeight: 600,
    color: 'var(--mc-text-tertiary, #5c6478)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--mc-border, #1e2536)',
    userSelect: sortable ? ('none' as const) : ('auto' as const),
    cursor: sortable ? 'pointer' : 'default',
  };

  const tdStyle = {
    padding: 'var(--mc-space-2, 8px) var(--mc-space-3, 12px)',
    fontSize: 'var(--mc-text-body, 0.8125rem)',
    color: 'var(--mc-text-primary, #f0f2f7)',
    borderBottom: '1px solid var(--mc-border-subtle, #151b28)',
  };

  return (
    <div
      style={{
        background: 'var(--mc-surface-raised, #0c1019)',
        borderRadius: 'var(--mc-radius-lg, 12px)',
        border: '1px solid var(--mc-border, #1e2536)',
        overflow: 'auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ ...thStyle, width: col.width }}
                onClick={() => handleSort(col.key)}
              >
                {col.header}
                {sortable && sortKey === col.key && (
                  <span style={{ marginLeft: 4 }}>{sortAsc ? '\u2191' : '\u2193'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key} style={tdStyle}>
                  {row[col.key] != null ? String(row[col.key]) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
