import { create } from 'zustand';
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';

declare global {
  interface Window {
    __ZUSTAND_GRAPH_STORE?: typeof useGraphStore;
  }
}

export type LODLevel = 'project' | 'directory' | 'file';

/** Legend filter keys — toggleable visibility */
export type FilterKey = 'directory' | 'typescript' | 'javascript' | 'python' | 'import' | 'co-change' | 'dir-edge';

interface GraphState {
  data: GraphData | null;
  nodeMap: Map<string, GraphNode>;
  /** Pre-computed adjacency map: nodeId → Set of connected nodeIds (O(1) lookup) */
  adjacencyMap: Map<string, Set<string>>;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  connectedNodeIds: Set<string>;
  lodLevel: LODLevel;
  graphVersion: number;
  /** Hidden filters — items in this set are NOT shown */
  hiddenFilters: Set<FilterKey>;
  /** Current target directory path */
  targetPath: string;
  /** Entry animation progress 0-1 */
  entryProgress: number;
  /** Whether entry animation is active */
  entryActive: boolean;
  /** Timeline replay: only show nodes in this set. null = show all (live mode). */
  timelineVisibleIds: Set<string> | null;

  setData: (data: GraphData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  setLodLevel: (level: LODLevel) => void;
  toggleFilter: (key: FilterKey) => void;
  setTargetPath: (path: string) => void;
  /** Re-target to a new directory, returns error string or null */
  retarget: (path: string) => Promise<string | null>;
  /** Re-layout with new dirCohesion (0-100) */
  relayout: (dirCohesion: number) => Promise<void>;
  getNode: (nodeId: string) => GraphNode | undefined;
  getConnectedEdges: (nodeId: string) => GraphEdge[];
  tickEntry: (delta: number) => void;
  setTimelineVisibleIds: (ids: Set<string> | null) => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  data: null,
  nodeMap: new Map(),
  adjacencyMap: new Map(),
  loading: true,
  error: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  connectedNodeIds: new Set(),
  lodLevel: 'directory' as LODLevel,
  graphVersion: 0,
  hiddenFilters: new Set<FilterKey>(),
  targetPath: '',
  entryProgress: 0,
  entryActive: false,
  timelineVisibleIds: null,

  setData: (data) => {
    const nodeMap = new Map<string, GraphNode>();
    for (const node of data.nodes) {
      nodeMap.set(node.id, node);
    }
    // Pre-compute adjacency map for O(1) connected node lookup
    const adjacencyMap = new Map<string, Set<string>>();
    for (const edge of data.edges) {
      if (!adjacencyMap.has(edge.source)) adjacencyMap.set(edge.source, new Set());
      if (!adjacencyMap.has(edge.target)) adjacencyMap.set(edge.target, new Set());
      adjacencyMap.get(edge.source)!.add(edge.target);
      adjacencyMap.get(edge.target)!.add(edge.source);
    }
    set(s => ({ data, nodeMap, adjacencyMap, loading: false, error: null, graphVersion: s.graphVersion + 1, entryProgress: 0, entryActive: true }));
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),

  selectNode: (nodeId) => {
    if (!nodeId || !get().data) {
      set({ selectedNodeId: null, connectedNodeIds: new Set() });
      return;
    }

    // O(1) lookup via pre-computed adjacency map (was O(E) edge scan)
    const connected = get().adjacencyMap.get(nodeId) ?? new Set();
    set({ selectedNodeId: nodeId, connectedNodeIds: connected });
  },

  hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setLodLevel: (level) => set({ lodLevel: level }),
  toggleFilter: (key) => set((s) => {
    const next = new Set(s.hiddenFilters);
    if (next.has(key)) next.delete(key); else next.add(key);
    return { hiddenFilters: next };
  }),
  setTargetPath: (path) => set({ targetPath: path }),
  retarget: async (path) => {
    const trimmed = path.trim();
    if (!trimmed) return 'Path is empty';
    set({ loading: true, error: null, selectedNodeId: null, connectedNodeIds: new Set() });
    try {
      const res = await fetch('/api/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Re-fetch the graph
      const graphRes = await fetch('/api/graph');
      if (!graphRes.ok) throw new Error('Failed to reload graph');
      const graphData: GraphData = await graphRes.json();
      const nodeMap = new Map<string, GraphNode>();
      for (const node of graphData.nodes) nodeMap.set(node.id, node);
      const adjacencyMap = new Map<string, Set<string>>();
      for (const edge of graphData.edges) {
        if (!adjacencyMap.has(edge.source)) adjacencyMap.set(edge.source, new Set());
        if (!adjacencyMap.has(edge.target)) adjacencyMap.set(edge.target, new Set());
        adjacencyMap.get(edge.source)!.add(edge.target);
        adjacencyMap.get(edge.target)!.add(edge.source);
      }
      set(s => ({
        data: graphData,
        nodeMap,
        adjacencyMap,
        loading: false,
        error: null,
        targetPath: trimmed,
        graphVersion: s.graphVersion + 1,
      }));
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to retarget';
      set({ error: msg, loading: false });
      return msg;
    }
  },

  relayout: async (dirCohesion) => {
    try {
      const res = await fetch('/api/relayout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirCohesion }),
      });
      if (!res.ok) {
        // 조용히 삼키지 않는다: 실패를 error 상태로 표출(retarget과 동일 패턴).
        // debounce 슬라이더라 동일 메시지 중복 set은 생략(플리커 방지).
        const msg = `레이아웃 재계산 실패 (HTTP ${res.status})`;
        if (get().error !== msg) set({ error: msg });
        return;
      }
      // 성공 시 그래프 갱신은 WebSocket broadcast로 도착
    } catch (err) {
      const msg = err instanceof Error ? err.message : '레이아웃 재계산 네트워크 오류';
      if (get().error !== msg) set({ error: msg });
    }
  },

  getNode: (nodeId) => {
    return get().nodeMap.get(nodeId);
  },

  getConnectedEdges: (nodeId) => {
    const { data } = get();
    if (!data) return [];
    return data.edges.filter(e => e.source === nodeId || e.target === nodeId);
  },

  tickEntry: (delta) => {
    const { entryActive, entryProgress } = get();
    if (!entryActive) return;
    const next = Math.min(entryProgress + delta * 0.4, 1); // ~2.5s total
    set({ entryProgress: next, entryActive: next < 1 });
  },

  setTimelineVisibleIds: (ids) => set({ timelineVisibleIds: ids }),
}));

// Expose store to window for testing (dev only)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  window.__ZUSTAND_GRAPH_STORE = useGraphStore;
}
