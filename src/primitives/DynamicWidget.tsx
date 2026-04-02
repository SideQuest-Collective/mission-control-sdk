import type { TeamSpecificWidgetDescriptor } from '../types.js';
import { StatCard } from './StatCard.js';
import { Sparkline } from './Sparkline.js';
import { BarChart } from './BarChart.js';
import { Table } from './Table.js';
import { List } from './List.js';
import { StatusGrid } from './StatusGrid.js';
import { Timeline } from './Timeline.js';

export interface DynamicWidgetProps {
  descriptor: TeamSpecificWidgetDescriptor;
}

/**
 * Reads a TeamSpecificWidgetDescriptor and delegates to the appropriate
 * primitive renderer. The `config` object on the descriptor is spread
 * as props to the underlying primitive.
 */
export function DynamicWidget({ descriptor }: DynamicWidgetProps) {
  const { primitive, title, config } = descriptor;

  switch (primitive) {
    case 'stat-card':
      return (
        <StatCard
          value={(config.value as string | number) ?? '--'}
          label={title}
          delta={config.delta as number | undefined}
          unit={config.unit as string | undefined}
        />
      );

    case 'sparkline':
      return (
        <Sparkline
          value={(config.value as string | number) ?? '--'}
          label={title}
          data={(config.data as number[]) ?? []}
          delta={config.delta as number | undefined}
          unit={config.unit as string | undefined}
          color={config.color as string | undefined}
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
