import { useEffect, useRef, useCallback } from 'react';
import { useGraphStore } from '../store/graph-store';
import { useAgentStore } from '../store/agent-store';
import { CONFIG } from '../utils/config';
import type { WsServerMessage } from '../types/ws';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setData = useGraphStore(s => s.setData);
  const addEvent = useAgentStore(s => s.addEvent);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
    };

    ws.onmessage = (evt) => {
      try {
        const msg: WsServerMessage = JSON.parse(evt.data);

        switch (msg.type) {
          case 'graph:update':
            setData(msg.payload);
            break;
          case 'file:change':
            if (msg.payload.agentEvent) {
              addEvent(msg.payload.agentEvent);
            }
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...');
      reconnectTimeout.current = setTimeout(connect, CONFIG.ws.reconnectDelay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setData, addEvent]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
