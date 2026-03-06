import type { GraphData } from './graph';
import type { AgentEvent } from './agent';

/** Discriminated union of all WebSocket messages from the server */

export type WsServerMessage =
  | { type: 'connected'; payload: { timestamp: number } }
  | { type: 'graph:update'; payload: GraphData }
  | { type: 'file:change'; payload: FileChangePayload };

export interface FileChangePayload {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  relativePath: string;
  timestamp: number;
  agentEvent?: AgentEvent;
}
