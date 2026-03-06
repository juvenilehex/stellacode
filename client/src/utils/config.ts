/** Centralized client configuration */

export const CONFIG = {
  ws: {
    /** Delay (ms) before attempting WebSocket reconnection */
    reconnectDelay: 3_000,
  },

  agent: {
    /** Maximum stored events in agent store */
    maxStoredEvents: 200,
  },
} as const;
