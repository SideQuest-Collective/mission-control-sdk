import type { SkynetEvent, ControlPlaneCommand } from './types.js';

export interface SkynetClientOptions {
  wsUrl: string;
  httpUrl: string;
  authToken?: string;
}

type EventHandler = (event: SkynetEvent) => void;

/**
 * WebSocket + HTTP connection to Skynet.
 * Auto-reconnects with exponential backoff on disconnect.
 */
export class SkynetClient {
  private options: SkynetClientOptions;
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SkynetClientOptions) {
    this.options = options;
  }

  /** Open the WebSocket connection */
  connect(): void {
    if (this.ws) return;

    const url = this.options.authToken
      ? `${this.options.wsUrl}?token=${encodeURIComponent(this.options.authToken)}`
      : this.options.wsUrl;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as SkynetEvent;
        for (const handler of this.handlers) {
          handler(data);
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onclose = (event) => {
      this.connected = false;
      this.ws = null;

      // Auth failures — don't reconnect
      if (event.code === 1008 || event.code === 1002) {
        return;
      }

      this.attemptReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  /** Close the WebSocket connection */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /** Register a handler for incoming Skynet events */
  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Send a command to Skynet via HTTP POST */
  async sendCommand(cmd: ControlPlaneCommand): Promise<Record<string, unknown>> {
    const url = `${this.options.httpUrl}/command`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(cmd),
    });

    if (!response.ok) {
      throw new Error(`Skynet command failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  /** Fetch JSON from a Skynet HTTP endpoint */
  async httpGet<T>(path: string): Promise<T> {
    const url = `${this.options.httpUrl}${path}`;
    const headers: Record<string, string> = {};
    if (this.options.authToken) {
      headers['Authorization'] = `Bearer ${this.options.authToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Skynet HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /** Whether the WebSocket is currently connected */
  get isConnected(): boolean {
    return this.connected;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
