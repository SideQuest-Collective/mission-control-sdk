import type { SkynetClient } from './client.js';
import type { AgentHealthSnapshot } from './types.js';

type UpdateCallback = (snapshots: AgentHealthSnapshot[]) => void;

/**
 * Polls agent state from Skynet HTTP endpoint.
 * Provides periodic health snapshots for all agents.
 */
export class AgentStatePoller {
  private client: SkynetClient;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private callbacks: Set<UpdateCallback> = new Set();

  constructor(client: SkynetClient) {
    this.client = client;
  }

  /** Start polling at the given interval */
  start(intervalMs: number = 10_000): void {
    if (this.intervalId) return;

    // Fetch immediately on start
    void this.poll();

    this.intervalId = setInterval(() => {
      void this.poll();
    }, intervalMs);
  }

  /** Stop polling */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Register a callback for state updates */
  onUpdate(callback: UpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private async poll(): Promise<void> {
    try {
      const data = await this.client.httpGet<{ agents: AgentHealthSnapshot[] }>('/metrics');
      const snapshots = data.agents ?? [];
      for (const cb of this.callbacks) {
        cb(snapshots);
      }
    } catch {
      // Polling errors are non-fatal — next tick will retry
    }
  }
}
