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

/**
 * Fetches tasks from `/api/tasks`.
 * Polls every 10s.
 */
export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      if (tasks.length === 0) setLoading(true);
      const data = await fetchApi<{ tasks: Task[] }>('/api/tasks');
      if (mountedRef.current) {
        setTasks(data.tasks ?? []);
        setError(null);
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
