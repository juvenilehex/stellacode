import { useEffect } from 'react';
import { useGraphStore } from '../store/graph-store';
import type { GraphData } from '../types/graph';

const API_BASE = '/api';

export function useGraphData() {
  const { setData, setLoading, setError } = useGraphStore();

  useEffect(() => {
    let cancelled = false;

    async function fetchGraph() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/graph`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: GraphData = await res.json();
        if (!cancelled) setData(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load graph');
      }
    }

    fetchGraph();
    return () => { cancelled = true; };
  }, [setData, setLoading, setError]);
}
