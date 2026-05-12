import type { AgentTracker } from '../agent/tracker.js';
import type { WsBroadcaster } from '../ws.js';
import type { GraphData } from '../graph/types.js';

/** Shared server context passed to route modules */
export interface ServerContext {
  getGraphData: () => GraphData;
  getTargetDir: () => string;
  setTargetDir: (dir: string) => void;
  agentTracker: AgentTracker;
  broadcaster: WsBroadcaster;
  rebuildGraph: () => void;
  getParseSuccessCount: () => number;
  getParseFailureCount: () => number;
  getActiveWatcher: () => { close: () => void };
  setActiveWatcher: (w: { close: () => void }) => void;
  getLiveWatcher: () => { updateTarget: (dir: string) => void };
}
