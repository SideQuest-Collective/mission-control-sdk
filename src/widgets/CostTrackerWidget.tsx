import { useCosts } from '../hooks/index.js';
import { Sparkline } from '../primitives/index.js';

export function CostTrackerWidget() {
  const { total, trend } = useCosts();

  return (
    <Sparkline
      value={`$${total.toFixed(2)}`}
      label="Estimated Cost Today"
      data={trend}
      color="var(--mc-chart-4, #f59e0b)"
    />
  );
}
