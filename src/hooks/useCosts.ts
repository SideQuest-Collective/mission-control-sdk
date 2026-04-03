import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchApi } from './api-client.js';

export interface CostByAgent {
  agent_id: string;
  agent_name: string;
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

interface CostSummaryResponse {
  total: number;
  by_model?: Record<string, number>;
}

interface CostBreakdownEntry {
  agent_id: string;
  agent_name: string;
  total: number;
  input_tokens: number;
  output_tokens: number;
}

interface CostBreakdownResponse {
  breakdown: CostBreakdownEntry[];
}

function buildTrend(summary: CostSummaryResponse): number[] {
  const modelTotals = Object.values(summary.by_model ?? {}).filter((value) => Number.isFinite(value));
  if (modelTotals.length > 0) {
    return modelTotals;
  }

  return summary.total > 0 ? [summary.total] : [];
}

/**
 * Fetches cost summary and breakdown data from `/api/v4/costs/summary` and `/api/v4/costs/breakdown`.
 * Polls every 30s.
 */
export function useCosts(): UseCostsResult {
  const [total, setTotal] = useState(0);
  const [byAgent, setByAgent] = useState<CostByAgent[]>([]);
  const [trend, setTrend] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const hasLoadedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const [summary, breakdown] = await Promise.all([
        fetchApi<CostSummaryResponse>('/api/v4/costs/summary?period=24h'),
        fetchApi<CostBreakdownResponse>('/api/v4/costs/breakdown'),
      ]);

      const byAgentData = (breakdown.breakdown ?? []).map((entry) => ({
        agent_id: entry.agent_id,
        agent_name: entry.agent_name,
        cost: entry.total,
        tokens: entry.input_tokens + entry.output_tokens,
      }));

      if (mountedRef.current) {
        setTotal(summary.total ?? 0);
        setByAgent(byAgentData);
        setTrend(buildTrend(summary));
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

  return { total, byAgent, trend, loading, error };
}
