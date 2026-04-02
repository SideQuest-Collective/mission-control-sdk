import { useTasks } from '../hooks/index.js';
import type { Task } from '../hooks/useTasks.js';

const COLUMNS = ['todo', 'in_progress', 'done'] as const;
const COLUMN_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

export function TaskBoardWidget() {
  const { tasks } = useTasks();

  const grouped: Record<string, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const task of tasks) {
    const col = COLUMNS.includes(task.status) ? task.status : 'todo';
    grouped[col].push(task);
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`,
        gap: 'var(--mc-space-3, 12px)',
      }}
    >
      {COLUMNS.map((col) => (
        <div key={col}>
          {/* Column header */}
          <div
            style={{
              fontSize: 'var(--mc-text-caption, 0.6875rem)',
              fontWeight: 600,
              color: 'var(--mc-text-tertiary, #5c6478)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 'var(--mc-space-2, 8px)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--mc-space-1, 4px)',
            }}
          >
            {COLUMN_LABELS[col]}
            <span
              style={{
                background: 'var(--mc-surface-elevated, #121722)',
                borderRadius: 'var(--mc-radius-full, 9999px)',
                padding: '0 6px',
                fontSize: 'var(--mc-text-caption, 0.6875rem)',
              }}
            >
              {grouped[col].length}
            </span>
          </div>

          {/* Cards */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--mc-space-2, 8px)',
              minHeight: 60,
            }}
          >
            {grouped[col].map((task) => (
              <div
                key={task.id}
                style={{
                  padding: 'var(--mc-space-3, 12px)',
                  background: 'var(--mc-surface-raised, #0c1019)',
                  borderRadius: 'var(--mc-radius-md, 8px)',
                  border: '1px solid var(--mc-border-subtle, #151b28)',
                  fontSize: 'var(--mc-text-body-sm, 0.75rem)',
                  color: 'var(--mc-text-primary, #f0f2f7)',
                }}
              >
                <div style={{ fontWeight: 500 }}>{task.title}</div>
                {task.assignee && (
                  <div
                    style={{
                      fontSize: 'var(--mc-text-caption, 0.6875rem)',
                      color: 'var(--mc-text-tertiary, #5c6478)',
                      marginTop: 'var(--mc-space-1, 4px)',
                    }}
                  >
                    {task.assignee}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
