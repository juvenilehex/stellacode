import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

/** All message types the server can broadcast */
export type WsMessageType = 'connected' | 'graph:update' | 'file:change' | 'agent:live';

/** Maximum simultaneous WebSocket connections */
const MAX_CONNECTIONS = 20;

/** Heartbeat interval (ms) — detect dead connections */
const HEARTBEAT_INTERVAL = 30_000;

export class WsBroadcaster {
  private wss: WebSocketServer;
  private heartbeatTimer: ReturnType<typeof setInterval>;

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

      // Mark alive for heartbeat
      (ws as unknown as { isAlive: boolean }).isAlive = true;
      ws.on('pong', () => { (ws as unknown as { isAlive: boolean }).isAlive = true; });

      ws.on('error', (err) => console.error('[WS] Client error:', err.message));

      // Reject oversized messages (1MB limit)
      ws.on('message', (data) => {
        if (Buffer.byteLength(data as Buffer) > 1_048_576) {
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

  close(): void {
    clearInterval(this.heartbeatTimer);
    this.wss.close();
  }
}
