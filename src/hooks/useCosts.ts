import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchApi } from './api-client.js';

export interface CostByAgent {
  agent_id: string;
  cost: number;
  tokens: number;
}

export interface UseCostsResult {
  total: number;
  byAgent: CostByAgent[];
  trend: number[];
  loading: boolean;
  error: Error | null;
}

const POLL_INTERVAL_MS = 30_000;

interface CostsApiResponse {
  total: number;
  byAgent: CostByAgent[];
  trend: number[];
}

/**
 * Fetches cost data from `/api/v4/costs`.
 * Polls every 30s.
 */
export function useCosts(): UseCostsResult {
  const [total, setTotal] = useState(0);
  const [byAgent, setByAgent] = useState<CostByAgent[]>([]);
  const [trend, setTrend] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      if (total === 0 && byAgent.length === 0) setLoading(true);
      const data = await fetchApi<CostsApiResponse>('/api/v4/costs');
      if (mountedRef.current) {
        setTotal(data.total ?? 0);
        setByAgent(data.byAgent ?? []);
        setTrend(data.trend ?? []);
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

  return { total, byAgent, trend, loading, error };
}
