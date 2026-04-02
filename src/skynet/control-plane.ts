import type { SkynetClient } from './client.js';
import type { ControlPlaneCommand } from './types.js';

/**
 * Issues commands to the Skynet control plane.
 * Uses SkynetClient's HTTP connection for all operations.
 */
export class ControlPlane {
  private client: SkynetClient;

  constructor(client: SkynetClient) {
    this.client = client;
  }

  /** Reset a specific agent */
  async reset(agentId: string): Promise<Record<string, unknown>> {
    const cmd: ControlPlaneCommand = {
      action: 'reset',
      agentId,
      timestamp: Date.now(),
    };
    return this.client.sendCommand(cmd);
  }

  /** Trigger a checkpoint across all agents */
  async checkpoint(): Promise<Record<string, unknown>> {
    const cmd: ControlPlaneCommand = {
      action: 'checkpoint',
      timestamp: Date.now(),
    };
    return this.client.sendCommand(cmd);
  }

  /** Request overall system health */
  async health(): Promise<Record<string, unknown>> {
    const cmd: ControlPlaneCommand = {
      action: 'health',
      timestamp: Date.now(),
    };
    return this.client.sendCommand(cmd);
  }
}
