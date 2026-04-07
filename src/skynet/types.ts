/** Shared Skynet contract types */

/** Event emitted by Skynet over WebSocket */
export interface SkynetEvent {
  type: string;
  timestamp: number;
  event_id?: string;
  agent_id?: string;
  session_id?: string;
  sequence?: number;
  occurred_at?: string;
  payload: Record<string, unknown>;
}

/** Telemetry event for per-agent metrics */
export interface TelemetryEvent {
  type: 'telemetry';
  agentId: string;
  timestamp: number;
  messagesSent: number;
  messagesReceived: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  queueDepth: number;
  failures: number;
  contextUsed: number;
  contextTotal: number;
}

/** Point-in-time agent health snapshot */
export interface AgentHealthSnapshot {
  agentId: string;
  messagesSent: number;
  messagesReceived: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  queueDepth: number;
  circuitState: CircuitBreakerState;
  failures: number;
  contextUsed: number;
  contextTotal: number;
}

/** Circuit breaker state for an agent connection */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** Command sent to the Skynet control plane */
export interface ControlPlaneCommand {
  action: 'reset' | 'checkpoint' | 'health' | 'halt' | 'resume';
  agentId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
