import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchApi } from './api-client.js';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  agent_id: string;
  type: string;
  summary: string;
}

export interface UseActivityResult {
  events: ActivityEvent[];
  loading: boolean;
  error: Error | null;
}

const POLL_INTERVAL_MS = 10_000;

/**
 * Fetches activity feed from `/api/activity`.
 * Polls every 10s.
 */
export function useActivity(): UseActivityResult {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      if (events.length === 0) setLoading(true);
      const data = await fetchApi<{ events: ActivityEvent[] }>('/api/activity');
      if (mountedRef.current) {
        setEvents(data.events ?? []);
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

  return { events, loading, error };
}
