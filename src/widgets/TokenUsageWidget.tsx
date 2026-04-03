import { useCosts } from '../hooks/index.js';
import { BarChart } from '../primitives/index.js';

export function TokenUsageWidget() {
  const { byAgent } = useCosts();

  const chartData = byAgent.map((entry, i) => ({
    label: entry.agent_name || entry.agent_id,
    value: entry.tokens,
    color: `var(--mc-chart-${(i % 8) + 1})`,
  }));

  return <BarChart data={chartData} orientation="horizontal" title="Token Usage by Agent" />;
}
