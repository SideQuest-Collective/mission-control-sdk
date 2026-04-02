import { useState, useEffect, useCallback, useRef } from 'react';
import type { KpiValue } from '../types.js';
import { fetchApi } from './api-client.js';
import { KPI_REGISTRY } from '../kpis/registry.js';
import { getKpisForRolePacks } from '../kpis/role-pack-map.js';

export interface UseKpisOptions {
  rolePacks?: string[];
}

export interface UseKpisResult {
  kpis: KpiValue[];
  loading: boolean;
  error: Error | null;
}

const POLL_INTERVAL_MS = 60_000;

/**
 * Fetches KPI values from `/api/productivity/kpis`.
 * Polls every 60s. Filters based on the team's `role_packs` using the KPI registry.
 */
export function useKpis(options: UseKpisOptions = {}): UseKpisResult {
  const { rolePacks } = options;
  const [kpis, setKpis] = useState<KpiValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      if (kpis.length === 0) setLoading(true);
      const data = await fetchApi<{ kpis: KpiValue[] }>('/api/productivity/kpis');
      if (mountedRef.current) {
        let filtered = data.kpis ?? [];

        // Filter by role packs if provided
        if (rolePacks && rolePacks.length > 0) {
          const allowedDefs = getKpisForRolePacks(rolePacks);
          const allowedIds = new Set(allowedDefs.map((d) => d.id));
          filtered = filtered.filter((k) => allowedIds.has(k.id));
        }

        setKpis(filtered);
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
  }, [rolePacks]);

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

  return { kpis, loading, error };
}
