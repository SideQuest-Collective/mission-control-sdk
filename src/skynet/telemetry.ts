import type { SkynetClient } from './client.js';
import type { SkynetEvent } from './types.js';

type TelemetryCallback = (event: SkynetEvent) => void;

/**
 * Wraps SkynetClient for telemetry-specific subscriptions.
 * Filters incoming events by type and dispatches to registered callbacks.
 */
export class TelemetrySubscriber {
  private client: SkynetClient;
  private subscriptions: Map<string, Set<TelemetryCallback>> = new Map();
  private unsubscribeFromClient: (() => void) | null = null;

  constructor(client: SkynetClient) {
    this.client = client;
    this.unsubscribeFromClient = this.client.onEvent((event) => {
      this.dispatch(event);
    });
  }

  /** Subscribe to events of a specific type */
  subscribe(eventType: string, callback: TelemetryCallback): void {
    let callbacks = this.subscriptions.get(eventType);
    if (!callbacks) {
      callbacks = new Set();
      this.subscriptions.set(eventType, callbacks);
    }
    callbacks.add(callback);
  }

  /** Unsubscribe from events of a specific type */
  unsubscribe(eventType: string, callback?: TelemetryCallback): void {
    if (!callback) {
      this.subscriptions.delete(eventType);
      return;
    }
    const callbacks = this.subscriptions.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscriptions.delete(eventType);
      }
    }
  }

  /** Tear down all subscriptions and disconnect from the client */
  destroy(): void {
    this.subscriptions.clear();
    if (this.unsubscribeFromClient) {
      this.unsubscribeFromClient();
      this.unsubscribeFromClient = null;
    }
  }

  private dispatch(event: SkynetEvent): void {
    const callbacks = this.subscriptions.get(event.type);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(event);
      }
    }
  }
}
