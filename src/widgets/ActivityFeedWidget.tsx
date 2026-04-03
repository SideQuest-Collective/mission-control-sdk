import { useActivity } from '../hooks/index.js';
import type { TimelineEvent } from '../primitives/index.js';
import { Timeline } from '../primitives/index.js';

export function ActivityFeedWidget() {
  const { events } = useActivity();

  if (events.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--mc-space-6, 24px)',
          textAlign: 'center',
          color: 'var(--mc-text-secondary, #8b93a8)',
          fontSize: 'var(--mc-text-body, 0.8125rem)',
        }}
      >
        No recent activity
      </div>
    );
  }

  const timelineEvents: TimelineEvent[] = events.map((e) => ({
    id: e.id,
    timestamp: e.timestamp,
    title: e.summary,
    detail: e.agent_id,
    type: e.type,
  }));

  return <Timeline events={timelineEvents} />;
}
