import { create } from 'zustand';
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';

export type LODLevel = 'project' | 'directory' | 'file';

/** Legend filter keys — toggleable visibility */
export type FilterKey = 'directory' | 'typescript' | 'javascript' | 'python' | 'import' | 'co-change' | 'dir-edge';

interface GraphState {
  data: GraphData | null;
  nodeMap: Map<string, GraphNode>;
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
  getNode: (nodeId: string) => GraphNode | undefined;
  getConnectedEdges: (nodeId: string) => GraphEdge[];
}

export const useGraphStore = create<GraphState>((set, get) => ({
  data: null,
  nodeMap: new Map(),
  loading: true,
  error: null,
  selectedNodeId: null,
  hoveredNodeId: null,
  connectedNodeIds: new Set(),
  lodLevel: 'directory' as LODLevel,
  graphVersion: 0,
  hiddenFilters: new Set<FilterKey>(),
  targetPath: '',

  setData: (data) => {
    const nodeMap = new Map<string, GraphNode>();
    for (const node of data.nodes) {
      nodeMap.set(node.id, node);
    }
    set(s => ({ data, nodeMap, loading: false, error: null, graphVersion: s.graphVersion + 1 }));
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),

  selectNode: (nodeId) => {
    const { data } = get();
    if (!nodeId || !data) {
      set({ selectedNodeId: null, connectedNodeIds: new Set() });
      return;
    }

    const connected = new Set<string>();
    for (const edge of data.edges) {
      if (edge.source === nodeId) connected.add(edge.target);
      if (edge.target === nodeId) connected.add(edge.source);
    }

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
      set(s => ({
        data: graphData,
        nodeMap,
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

  getNode: (nodeId) => {
    return get().nodeMap.get(nodeId);
  },

  getConnectedEdges: (nodeId) => {
    const { data } = get();
    if (!data) return [];
    return data.edges.filter(e => e.source === nodeId || e.target === nodeId);
  },
}));
