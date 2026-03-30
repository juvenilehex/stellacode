import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../graph-store';
import type { GraphData, GraphNode, GraphEdge } from '../../types/graph';

/** Factory for minimal valid GraphData */
function makeGraph(overrides?: Partial<GraphData>): GraphData {
  return {
    nodes: [],
    edges: [],
    rootDir: '/test',
    timestamp: Date.now(),
    stats: { totalFiles: 0, totalDirs: 0, totalSymbols: 0, totalEdges: 0, languages: {} },
    ...overrides,
  };
}

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return {
    id,
    label: id,
    type: 'file',
    language: 'typescript',
    symbolCount: 1,
    lineCount: 10,
    size: 100,
    x: 0, y: 0, z: 0,
    degree: 0,
    scale: 1,
    ...overrides,
  };
}

function makeEdge(source: string, target: string, overrides?: Partial<GraphEdge>): GraphEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: 'import',
    strength: 1,
    ...overrides,
  };
}

describe('graph-store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useGraphStore.setState({
      data: null,
      nodeMap: new Map(),
      loading: true,
      error: null,
      selectedNodeId: null,
      hoveredNodeId: null,
      connectedNodeIds: new Set(),
      lodLevel: 'directory',
      graphVersion: 0,
      hiddenFilters: new Set(),
      targetPath: '',
      entryProgress: 0,
      entryActive: false,
      timelineVisibleIds: null,
    });
  });

  describe('setData', () => {
    it('stores graph data and builds nodeMap', () => {
      const nodes = [makeNode('a'), makeNode('b')];
      const data = makeGraph({ nodes });

      useGraphStore.getState().setData(data);

      const state = useGraphStore.getState();
      expect(state.data).toBe(data);
      expect(state.nodeMap.size).toBe(2);
      expect(state.nodeMap.get('a')?.id).toBe('a');
      expect(state.nodeMap.get('b')?.id).toBe('b');
    });

    it('clears loading and error', () => {
      useGraphStore.setState({ loading: true, error: 'some error' });

      useGraphStore.getState().setData(makeGraph());

      const state = useGraphStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('increments graphVersion', () => {
      useGraphStore.getState().setData(makeGraph());
      expect(useGraphStore.getState().graphVersion).toBe(1);

      useGraphStore.getState().setData(makeGraph());
      expect(useGraphStore.getState().graphVersion).toBe(2);
    });

    it('triggers entry animation', () => {
      useGraphStore.getState().setData(makeGraph());

      const state = useGraphStore.getState();
      expect(state.entryProgress).toBe(0);
      expect(state.entryActive).toBe(true);
    });
  });

  describe('selectNode', () => {
    it('sets selectedNodeId and computes connectedNodeIds', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('a', 'b'), makeEdge('c', 'a')];
      useGraphStore.getState().setData(makeGraph({ nodes, edges }));

      useGraphStore.getState().selectNode('a');

      const state = useGraphStore.getState();
      expect(state.selectedNodeId).toBe('a');
      expect(state.connectedNodeIds.has('b')).toBe(true);
      expect(state.connectedNodeIds.has('c')).toBe(true);
      expect(state.connectedNodeIds.size).toBe(2);
    });

    it('clears selection when null', () => {
      useGraphStore.getState().setData(makeGraph({ nodes: [makeNode('a')] }));
      useGraphStore.getState().selectNode('a');
      useGraphStore.getState().selectNode(null);

      const state = useGraphStore.getState();
      expect(state.selectedNodeId).toBeNull();
      expect(state.connectedNodeIds.size).toBe(0);
    });

    it('returns empty connected set for isolated node', () => {
      const nodes = [makeNode('a'), makeNode('b')];
      useGraphStore.getState().setData(makeGraph({ nodes, edges: [] }));

      useGraphStore.getState().selectNode('a');

      expect(useGraphStore.getState().connectedNodeIds.size).toBe(0);
    });
  });

  describe('hoverNode', () => {
    it('sets hoveredNodeId', () => {
      useGraphStore.getState().hoverNode('x');
      expect(useGraphStore.getState().hoveredNodeId).toBe('x');

      useGraphStore.getState().hoverNode(null);
      expect(useGraphStore.getState().hoveredNodeId).toBeNull();
    });
  });

  describe('toggleFilter', () => {
    it('adds filter key to hiddenFilters', () => {
      useGraphStore.getState().toggleFilter('python');
      expect(useGraphStore.getState().hiddenFilters.has('python')).toBe(true);
    });

    it('removes filter key if already present', () => {
      useGraphStore.getState().toggleFilter('python');
      useGraphStore.getState().toggleFilter('python');
      expect(useGraphStore.getState().hiddenFilters.has('python')).toBe(false);
    });
  });

  describe('setLodLevel', () => {
    it('updates LOD level', () => {
      useGraphStore.getState().setLodLevel('file');
      expect(useGraphStore.getState().lodLevel).toBe('file');

      useGraphStore.getState().setLodLevel('project');
      expect(useGraphStore.getState().lodLevel).toBe('project');
    });
  });

  describe('getNode', () => {
    it('returns node by ID', () => {
      useGraphStore.getState().setData(makeGraph({ nodes: [makeNode('x')] }));
      expect(useGraphStore.getState().getNode('x')?.id).toBe('x');
    });

    it('returns undefined for missing ID', () => {
      useGraphStore.getState().setData(makeGraph());
      expect(useGraphStore.getState().getNode('nonexistent')).toBeUndefined();
    });
  });

  describe('getConnectedEdges', () => {
    it('returns edges connected to the node', () => {
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('d', 'e')];
      useGraphStore.getState().setData(makeGraph({ nodes: [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d'), makeNode('e')], edges }));

      const connected = useGraphStore.getState().getConnectedEdges('b');
      expect(connected).toHaveLength(2);
      expect(connected.map(e => e.id)).toContain('a->b');
      expect(connected.map(e => e.id)).toContain('b->c');
    });

    it('returns empty array when no data', () => {
      expect(useGraphStore.getState().getConnectedEdges('x')).toEqual([]);
    });
  });

  describe('tickEntry', () => {
    it('advances entry progress', () => {
      useGraphStore.getState().setData(makeGraph());
      expect(useGraphStore.getState().entryActive).toBe(true);

      useGraphStore.getState().tickEntry(0.5);
      const state = useGraphStore.getState();
      expect(state.entryProgress).toBeGreaterThan(0);
      expect(state.entryProgress).toBeLessThanOrEqual(1);
    });

    it('caps at 1 and deactivates', () => {
      useGraphStore.getState().setData(makeGraph());

      // Tick enough to complete
      useGraphStore.getState().tickEntry(10);
      const state = useGraphStore.getState();
      expect(state.entryProgress).toBe(1);
      expect(state.entryActive).toBe(false);
    });

    it('does nothing when not active', () => {
      useGraphStore.setState({ entryActive: false, entryProgress: 0.5 });
      useGraphStore.getState().tickEntry(1);
      expect(useGraphStore.getState().entryProgress).toBe(0.5);
    });
  });

  describe('setTimelineVisibleIds', () => {
    it('sets timeline visible IDs', () => {
      const ids = new Set(['file:a', 'file:b']);
      useGraphStore.getState().setTimelineVisibleIds(ids);
      expect(useGraphStore.getState().timelineVisibleIds).toBe(ids);
    });

    it('accepts null to clear', () => {
      useGraphStore.getState().setTimelineVisibleIds(new Set(['x']));
      useGraphStore.getState().setTimelineVisibleIds(null);
      expect(useGraphStore.getState().timelineVisibleIds).toBeNull();
    });
  });

  describe('setError / setLoading', () => {
    it('setError stores error and clears loading', () => {
      useGraphStore.setState({ loading: true });
      useGraphStore.getState().setError('boom');

      const state = useGraphStore.getState();
      expect(state.error).toBe('boom');
      expect(state.loading).toBe(false);
    });

    it('setLoading updates loading state', () => {
      useGraphStore.getState().setLoading(false);
      expect(useGraphStore.getState().loading).toBe(false);
    });
  });
});
