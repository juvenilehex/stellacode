import type { GraphData } from './graph';
import type { AgentEvent } from './agent';

/** Discriminated union of all WebSocket messages from the server */

export type WsServerMessage =
  | { type: 'connected'; payload: { timestamp: number } }
  | { type: 'graph:update'; payload: GraphData }
  | { type: 'file:change'; payload: FileChangePayload }
  | { type: 'agent:live'; payload: AgentEvent }
  | { type: 'build:integrity'; payload: BuildIntegrity };

/**
 * Integrity check of the server's latest build of its target (WS build:integrity and
 * GET /api/integrity). A failed build of the same target leaves the previous graph on
 * screen; (buildEpoch, buildId) order statuses the same way they order graphs.
 */
export interface BuildIntegrity {
  valid: boolean;
  nodeCount: number;
  edgeCount: number;
  errors: string[];
  timestamp: number;
  buildEpoch: string;
  buildId: number;
}

export interface FileChangePayload {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  relativePath: string;
  timestamp: number;
  agentEvent?: AgentEvent;
}
