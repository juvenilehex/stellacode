import { useEffect, useRef, useCallback } from 'react';
import { useGraphStore } from '../store/graph-store';
import { useAgentStore } from '../store/agent-store';
import { CONFIG } from '../utils/config';
import type { WsServerMessage, BuildIntegrity } from '../types/ws';
import type { GraphData } from '../types/graph';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setData = useGraphStore(s => s.setData);
  const setBuildStatus = useGraphStore(s => s.setBuildStatus);
  const addEvent = useAgentStore(s => s.addEvent);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      // Pushes sent while the socket was down (a server restart included) are lost, so
      // every (re)connect reads the current graph and build status once; the store keeps
      // whichever of these and a push is newer, so the first connect's repeat is a no-op.
      const load = <T,>(url: string, apply: (body: T) => void) =>
        fetch(url)
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<T>;
          })
          .then(apply)
          .catch(err => console.error(`[WS] ${url} not reloaded after connect — the view may be stale:`, err));
      load<GraphData>('/api/graph', setData);
      load<BuildIntegrity>('/api/integrity', setBuildStatus);
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
          case 'agent:live':
            addEvent(msg.payload);
            break;
          case 'build:integrity':
            setBuildStatus(msg.payload);
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...');
      // Clear previous timer to prevent accumulation
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = setTimeout(connect, CONFIG.ws.reconnectDelay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setData, setBuildStatus, addEvent]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      // onclose fires asynchronously after close() and would arm a fresh reconnect
      // timer, reviving a socket for an unmounted hook — a second live socket that
      // delivers every graph:update twice (seen under StrictMode's double mount).
      if (wsRef.current) wsRef.current.onclose = null;
      wsRef.current?.close();
    };
  }, [connect]);
}
