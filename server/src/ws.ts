import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

/** All message types the server can broadcast */
export type WsMessageType = 'connected' | 'graph:update' | 'file:change';

export class WsBroadcaster {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      ws.on('error', (err) => console.error('[WS] Client error:', err.message));
      // Send initial ping
      ws.send(JSON.stringify({ type: 'connected', payload: { timestamp: Date.now() } }));
    });
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
    this.wss.close();
  }
}
