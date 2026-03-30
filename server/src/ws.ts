import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { UsageTracker } from './usage-tracker.js';

/** All message types the server can broadcast */
export type WsMessageType = 'connected' | 'graph:update' | 'file:change' | 'agent:live' | 'quality:alert';

/** Maximum simultaneous WebSocket connections */
const MAX_CONNECTIONS = 20;

/** Heartbeat interval (ms) — detect dead connections */
const HEARTBEAT_INTERVAL = 30_000;

export class WsBroadcaster {
  private wss: WebSocketServer;
  private heartbeatTimer: ReturnType<typeof setInterval>;
  readonly usageTracker = new UsageTracker();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      // Connection limit
      if (this.wss.clients.size > MAX_CONNECTIONS) {
        ws.close(1013, 'Too many connections');
        return;
      }

      // Origin check — allow only localhost connections
      const origin = req.headers.origin ?? '';
      if (origin && !origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
        ws.close(1008, 'Origin not allowed');
        return;
      }

      // Track session (L2 usage statistics)
      const sessionId = this.usageTracker.onConnect();
      (ws as unknown as { sessionId: number }).sessionId = sessionId;

      // Mark alive for heartbeat
      (ws as unknown as { isAlive: boolean }).isAlive = true;
      ws.on('pong', () => { (ws as unknown as { isAlive: boolean }).isAlive = true; });

      ws.on('error', (err) => console.error('[WS] Client error:', err.message));

      ws.on('close', () => {
        this.usageTracker.onDisconnect(sessionId);
      });

      // Reject oversized messages (1MB limit).
      // RawData = Buffer | ArrayBuffer | Buffer[] — handle every variant so the
      // size check cannot be bypassed by sending a fragmented or ArrayBuffer message.
      ws.on('message', (data) => {
        let byteLen: number;
        if (Buffer.isBuffer(data)) {
          byteLen = data.byteLength;
        } else if (Array.isArray(data)) {
          byteLen = (data as Buffer[]).reduce((sum, chunk) => sum + chunk.byteLength, 0);
        } else if (data instanceof ArrayBuffer) {
          byteLen = data.byteLength;
        } else if (typeof data === 'string') {
          byteLen = Buffer.byteLength(data, 'utf8');
        } else {
          byteLen = 0;
        }
        if (byteLen > 1_048_576) {
          ws.close(1009, 'Message too large');
        }
      });

      // Send initial ping
      ws.send(JSON.stringify({ type: 'connected', payload: { timestamp: Date.now() } }));
    });

    // Heartbeat — terminate dead connections
    this.heartbeatTimer = setInterval(() => {
      for (const ws of this.wss.clients) {
        const client = ws as unknown as WebSocket & { isAlive: boolean };
        if (!client.isAlive) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, HEARTBEAT_INTERVAL);
  }

  broadcast(type: WsMessageType, payload: unknown): void {
    const message = JSON.stringify({ type, payload });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  /** Get session IDs of all currently connected clients */
  getActiveSessionIds(): number[] {
    const ids: number[] = [];
    for (const client of this.wss.clients) {
      const sessionId = (client as unknown as { sessionId?: number }).sessionId;
      if (sessionId != null) ids.push(sessionId);
    }
    return ids;
  }

  close(): void {
    clearInterval(this.heartbeatTimer);
    this.wss.close();
  }
}
