import { useState, useEffect, useCallback, useRef } from 'react';
import type { TeamBlock } from '../types.js';
import { fetchApi } from './api-client.js';

export interface UseManifestResult {
  team: TeamBlock | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Reads the runtime manifest team block.
 * Fetches from `/api/manifest` on mount and caches the result.
 */
export function useManifest(): UseManifestResult {
  const [team, setTeam] = useState<TeamBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchApi<{ team: TeamBlock }>('/api/manifest');
      if (mountedRef.current) {
        setTeam(data.team);
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
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { team, loading, error };
}
