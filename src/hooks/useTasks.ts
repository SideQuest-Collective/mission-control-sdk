import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchApi } from './api-client.js';

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;
  priority?: number;
}

export interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
}

const POLL_INTERVAL_MS = 10_000;

interface BoardIssue {
  number: number;
  title: string;
  assignee: string | null;
}

interface BoardResponse {
  columns: Array<{
    id: string;
    issues: BoardIssue[];
  }>;
}

const BOARD_STATUS_MAP: Record<string, Task['status']> = {
  backlog: 'todo',
  ready: 'todo',
  'in-progress': 'in_progress',
  'in-review': 'in_progress',
  done: 'done',
};

/**
 * Fetches the mounted kanban board from `/api/v4/tasks/board`.
 * Polls every 10s.
 */
export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const data = await fetchApi<BoardResponse>('/api/v4/tasks/board');
      const nextTasks = data.columns.flatMap((column) =>
        column.issues.map((issue) => ({
          id: String(issue.number),
          title: issue.title,
          status: BOARD_STATUS_MAP[column.id] ?? 'todo',
          assignee: issue.assignee ?? undefined,
        })),
      );

      if (mountedRef.current) {
        setTasks(nextTasks);
        setError(null);
        hasLoadedRef.current = true;
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    intervalRef.current = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  return { tasks, loading, error };
}
