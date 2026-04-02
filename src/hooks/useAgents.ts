import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentState } from '../types.js';
import { fetchApi } from './api-client.js';

export interface UseAgentsResult {
  agents: AgentState[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const POLL_INTERVAL_MS = 10_000;

/**
 * Fetches agent state list from `/api/agents`.
 * Polls every 10s. WebSocket invalidation on `agent-update` events.
 */
export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      if (agents.length === 0) setLoading(true);
      const data = await fetchApi<{ agents: AgentState[] }>('/api/agents');
      if (mountedRef.current) {
        setAgents(data.agents ?? []);
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

  const refetch = useCallback(() => {
    void load();
  }, [load]);

  // Polling
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

  // WebSocket invalidation
  useEffect(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type?: string };
          if (msg.type === 'agent-update') {
            void load();
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        // WebSocket errors are non-fatal; polling continues
      };
    } catch {
      // WebSocket unavailable; polling provides fallback
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [load]);

  return { agents, loading, error, refetch };
}
