import type { SkynetClient } from '../../skynet/client.js';

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
