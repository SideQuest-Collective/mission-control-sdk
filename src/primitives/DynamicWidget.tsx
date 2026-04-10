import { useKpis } from '../hooks/useKpis.js';
import type { KpiValue, TeamSpecificWidgetDescriptor } from '../types.js';
import { StatCard } from './StatCard.js';
import { Sparkline } from './Sparkline.js';
import { BarChart } from './BarChart.js';
import { Table } from './Table.js';
import { List } from './List.js';
import { StatusGrid } from './StatusGrid.js';
import { Timeline } from './Timeline.js';

export interface DynamicWidgetProps {
  descriptor: TeamSpecificWidgetDescriptor;
  kpis?: KpiValue[];
}

/**
 * Reads a TeamSpecificWidgetDescriptor and delegates to the appropriate
 * primitive renderer. The `config` object on the descriptor is spread
 * as props to the underlying primitive.
 */
function resolveKpi(descriptor: TeamSpecificWidgetDescriptor, kpis: KpiValue[]): KpiValue | null {
  const sourceSegments = descriptor.data_source.split('.');
  const sourceId = descriptor.data_source.startsWith('kpi.') && sourceSegments.length >= 3
    ? sourceSegments.slice(2).join('.')
    : descriptor.data_source;
  const descriptorId = descriptor.id.replace(/-/g, '_');

  return kpis.find((kpi) => kpi.id === sourceId || kpi.id === descriptorId) ?? null;
}

function resolveConfig(descriptor: TeamSpecificWidgetDescriptor, kpis: KpiValue[]) {
  const kpi = resolveKpi(descriptor, kpis);
  if (!kpi) {
    return descriptor.config;
  }

  const data = Array.isArray(kpi.recentValues)
    ? kpi.recentValues
    : typeof kpi.value === 'number'
      ? [kpi.value]
      : [];

  return {
    ...descriptor.config,
    value: descriptor.config.value ?? kpi.value,
    delta: descriptor.config.delta ?? kpi.delta,
    data: descriptor.config.data ?? data,
  };
}

function DynamicWidgetContent({
  descriptor,
  kpis,
}: {
  descriptor: TeamSpecificWidgetDescriptor;
  kpis: KpiValue[];
}) {
  const { primitive, title, config } = descriptor;
  const resolvedConfig = resolveConfig(descriptor, kpis);

  switch (primitive) {
    case 'stat-card':
      return (
        <StatCard
          value={(resolvedConfig.value as string | number) ?? '--'}
          label={title}
          delta={resolvedConfig.delta as number | undefined}
          unit={resolvedConfig.unit as string | undefined}
        />
      );

    case 'sparkline':
      return (
        <Sparkline
          value={(resolvedConfig.value as string | number) ?? '--'}
          label={title}
          data={(resolvedConfig.data as number[]) ?? []}
          delta={resolvedConfig.delta as number | undefined}
          unit={resolvedConfig.unit as string | undefined}
          color={resolvedConfig.color as string | undefined}
        />
      );

    case 'bar-chart':
      return (
        <BarChart
          data={(config.data as { label: string; value: number; color?: string }[]) ?? []}
          orientation={config.orientation as 'horizontal' | 'vertical' | undefined}
          title={title}
        />
      );

    case 'table':
      return (
        <Table
          columns={(config.columns as { key: string; header: string; width?: string }[]) ?? []}
          rows={(config.rows as Record<string, unknown>[]) ?? []}
          sortable={config.sortable as boolean | undefined}
        />
      );

    case 'list':
      return (
        <List
          items={
            (config.items as { id: string; label: string; status?: 'success' | 'warning' | 'error' | 'info'; detail?: string }[]) ?? []
          }
        />
      );

    case 'status-grid':
      return (
        <StatusGrid
          rows={(config.rows as string[]) ?? []}
          columns={(config.columns as string[]) ?? []}
          cells={(config.cells as { value: string; color: string }[][]) ?? []}
        />
      );

    case 'timeline':
      return (
        <Timeline
          events={
            (config.events as { id: string; timestamp: string; title: string; detail?: string; type?: string }[]) ?? []
          }
        />
      );

    default: {
      const _exhaustive: never = primitive;
      return (
        <div
          style={{
            padding: 'var(--mc-space-4, 16px)',
            color: 'var(--mc-text-secondary, #8b93a8)',
            fontSize: 'var(--mc-text-body, 0.8125rem)',
          }}
        >
          Unknown primitive: {String(_exhaustive)}
        </div>
      );
    }
  }
}

function DynamicWidgetWithKpiBinding({ descriptor }: { descriptor: TeamSpecificWidgetDescriptor }) {
  const { kpis } = useKpis();
  return <DynamicWidgetContent descriptor={descriptor} kpis={kpis} />;
}

export function DynamicWidget({ descriptor, kpis }: DynamicWidgetProps) {
  if (kpis) {
    return <DynamicWidgetContent descriptor={descriptor} kpis={kpis} />;
  }

  return <DynamicWidgetWithKpiBinding descriptor={descriptor} />;
}
