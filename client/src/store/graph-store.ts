import { create } from 'zustand';
import type { GraphData, GraphNode, GraphEdge } from '../types/graph';

interface GraphState {
  data: GraphData | null;
  nodeMap: Map<string, GraphNode>;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  connectedNodeIds: Set<string>;

  setData: (data: GraphData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
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

  setData: (data) => {
    const nodeMap = new Map<string, GraphNode>();
    for (const node of data.nodes) {
      nodeMap.set(node.id, node);
    }
    set({ data, nodeMap, loading: false, error: null });
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

  getNode: (nodeId) => {
    return get().nodeMap.get(nodeId);
  },

  getConnectedEdges: (nodeId) => {
    const { data } = get();
    if (!data) return [];
    return data.edges.filter(e => e.source === nodeId || e.target === nodeId);
  },
}));
