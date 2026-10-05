import type { WsBroadcaster } from '../ws.js';
import type { TargetSession } from '../target-session.js';

/** Shared server context passed to route modules */
export interface ServerContext {
  /** The observed directory: its graph, watchers, agent tracker and target switching */
  session: TargetSession;
  broadcaster: WsBroadcaster;
}
