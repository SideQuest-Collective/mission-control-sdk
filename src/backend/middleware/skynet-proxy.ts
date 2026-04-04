import type { SkynetClient } from '../../skynet/client.js';
import type { SkynetEvent } from '../../skynet/types.js';

/** KPI-related SSE event types forwarded by the proxy */
export type KpiSseEventType =
  | 'kpi.proposed'
  | 'kpi.vote_received'
  | 'kpi.activated'
  | 'kpi.deactivated';

export interface KpiProposedPayload {
  proposal_id: string;
  kpi_name: string;
  proposed_by?: string;
}

export interface KpiVoteReceivedPayload {
  proposal_id: string;
  voter_id: string;
  vote: 'approve' | 'reject';
}

export interface KpiActivatedPayload {
  kpi_id: string;
  widget_descriptor?: Record<string, unknown>;
}

export interface KpiDeactivatedPayload {
  kpi_id: string;
}

/** All SSE event types the proxy will forward */
const FORWARDED_EVENTS = new Set<string>([
  // Existing events
  'telemetry',
  'agent-update',
  // KPI proposal lifecycle events
  'kpi.proposed',
  'kpi.vote_received',
  'kpi.activated',
  'kpi.deactivated',
]);

/**
 * Creates an SSE (Server-Sent Events) middleware that proxies Skynet
 * WebSocket events to HTTP clients.
 *
 * Connect to Skynet via the provided client, then forward each event
 * as an SSE message to the response stream.
 */
export function createSkynetProxy(skynetClient: SkynetClient) {
  return function handler(_req: any, res: any): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Ensure the client is connected
    skynetClient.connect();

    // Forward events as SSE
    const unsubscribe = skynetClient.onEvent((event) => {
      const data = JSON.stringify(event);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${data}\n\n`);
    });

    // Clean up when the client disconnects
    res.on('close', () => {
      unsubscribe();
    });
  };
}

/**
 * Helper to emit a KPI SSE event through a Skynet client.
 * Called from route handlers when KPI proposal state changes.
 */
export function emitKpiEvent(
  skynetClient: SkynetClient,
  type: KpiSseEventType,
  payload: Record<string, unknown>,
): void {
  const event: SkynetEvent = {
    type,
    timestamp: Date.now(),
    payload,
  };
  // Broadcast to all connected SSE clients via the Skynet client's handlers
  // The proxy's onEvent subscription will pick it up and forward as SSE
  (skynetClient as any).handlers?.forEach?.((handler: (e: SkynetEvent) => void) => {
    handler(event);
  });
}
