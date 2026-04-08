import { useState, useEffect, useCallback, useRef } from 'react';
import type { TeamSpecificWidgetDescriptor } from '../types.js';
import type { ActiveKpi } from '../kpis/types.js';
import { fetchApi } from './api-client.js';

export interface UseRuntimeKpiWidgetsResult {
  widgets: TeamSpecificWidgetDescriptor[];
  loading: boolean;
  error: Error | null;
}

const MANIFEST_DYNAMIC_WIDGET_SOURCES = new Set(['llm-generated', 'bootstrap-llm']);

export function mergeRuntimeKpiWidgets(
  fallbackWidgets: TeamSpecificWidgetDescriptor[],
  activeKpis: ActiveKpi[],
): TeamSpecificWidgetDescriptor[] {
  const merged = new Map<string, TeamSpecificWidgetDescriptor>();
  for (const widget of fallbackWidgets) {
    if (MANIFEST_DYNAMIC_WIDGET_SOURCES.has(widget.derived_from)) {
      continue;
    }
    merged.set(widget.id, widget);
  }
  for (const active of activeKpis) {
    merged.set(active.widget_descriptor.id, active.widget_descriptor);
  }
  return [...merged.values()];
}

export function useRuntimeKpiWidgets(
  fallbackWidgets: TeamSpecificWidgetDescriptor[],
): UseRuntimeKpiWidgetsResult {
  const [widgets, setWidgets] = useState<TeamSpecificWidgetDescriptor[]>(fallbackWidgets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchApi<{ active: ActiveKpi[] }>('/api/kpis/active');
      if (mountedRef.current) {
        setWidgets(mergeRuntimeKpiWidgets(fallbackWidgets, data.active ?? []));
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
  }, [fallbackWidgets]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  useEffect(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type?: string };
          if (msg.type === 'kpi.activated' || msg.type === 'kpi.deactivated') {
            void load();
          }
        } catch {
          // Ignore non-JSON messages.
        }
      };
    } catch {
      // Fallback to initial fetch only.
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [load]);

  return { widgets, loading, error };
}
