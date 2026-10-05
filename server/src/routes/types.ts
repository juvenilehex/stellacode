import type { AgentTracker } from '../agent/tracker.js';
import type { WsBroadcaster } from '../ws.js';
import type { GraphData } from '../graph/types.js';
import type { IntegrityResult } from './quality.js';

/** Shared server context passed to route modules */
export interface ServerContext {
  getGraphData: () => GraphData;
  getTargetDir: () => string;
  /** Build `dir` and switch to it only if the graph passes the integrity check */
  switchTarget: (dir: string) => IntegrityResult;
  agentTracker: AgentTracker;
  broadcaster: WsBroadcaster;
  getParseSuccessCount: () => number;
  getParseFailureCount: () => number;
}
