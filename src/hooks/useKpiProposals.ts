import { useState, useEffect, useCallback, useRef } from 'react';
import type { KpiProposalRecord, KpiProposalVote } from '../kpis/types.js';
import { fetchApi } from './api-client.js';

export interface KpiCapacity {
  active: number;
  max: number;
  remaining: number;
}

export interface UseKpiProposalsOptions {
  /** Polling interval in ms (default 15000) */
  pollInterval?: number;
}

export interface UseKpiProposalsResult {
  proposals: KpiProposalRecord[];
  capacity: KpiCapacity | null;
  loading: boolean;
  error: Error | null;
  vote: (proposalId: string, vote: 'approve' | 'reject') => Promise<void>;
  refresh: () => void;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;

/**
 * Fetches KPI proposals and capacity from the REST API.
 * Polls at a configurable interval. Listens for WebSocket
 * invalidation on `kpi.proposed`, `kpi.vote_received`, `kpi.activated`,
 * and `kpi.deactivated` events.
 */
export function useKpiProposals(
  options: UseKpiProposalsOptions = {},
): UseKpiProposalsResult {
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL_MS;

  const [proposals, setProposals] = useState<KpiProposalRecord[]>([]);
  const [capacity, setCapacity] = useState<KpiCapacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      if (proposals.length === 0 && capacity === null) setLoading(true);

      const [proposalsData, capacityData] = await Promise.all([
        fetchApi<{ proposals: KpiProposalRecord[] }>('/api/kpis/proposals'),
        fetchApi<KpiCapacity>('/api/kpis/capacity'),
      ]);

      if (mountedRef.current) {
        setProposals(proposalsData.proposals ?? []);
        setCapacity(capacityData);
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

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  const vote = useCallback(
    async (proposalId: string, decision: 'approve' | 'reject') => {
      await fetchApi<{ proposal_id: string; status: string }>(
        `/api/kpis/proposals/${encodeURIComponent(proposalId)}/vote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vote: decision,
            voter_id: 'operator',
            voter_type: 'operator',
          }),
        },
      );
      // Refresh after voting
      void load();
    },
    [load],
  );

  // Polling
  useEffect(() => {
    mountedRef.current = true;
    void load();

    intervalRef.current = setInterval(() => {
      void load();
    }, pollInterval);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load, pollInterval]);

  // WebSocket invalidation
  useEffect(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const kpiEvents = new Set([
        'kpi.proposed',
        'kpi.vote_received',
        'kpi.activated',
        'kpi.deactivated',
      ]);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type?: string };
          if (msg.type && kpiEvents.has(msg.type)) {
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

  return { proposals, capacity, loading, error, vote, refresh };
}
