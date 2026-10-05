import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGraphStore } from '../graph-store';
import type { GraphData, GraphNode, GraphEdge } from '../../types/graph';

let nextId = 1000;
/** Factory for minimal valid GraphData — each call is a new server build unless buildId is given */
function makeGraph(overrides?: Partial<GraphData>): GraphData {
  return {
    nodes: [],
    edges: [],
    rootDir: '/test',
    timestamp: Date.now(),
    buildEpoch: 'epoch-1',
    buildId: nextId++,
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
      serverEpoch: null,
      retiredEpochs: new Set(),
      buildStatus: null,
      buildFailure: null,
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

    it('increments graphVersion for each new server build', () => {
      useGraphStore.getState().setData(makeGraph({ buildId: 1 }));
      expect(useGraphStore.getState().graphVersion).toBe(1);

      useGraphStore.getState().setData(makeGraph({ buildId: 2 }));
      expect(useGraphStore.getState().graphVersion).toBe(2);
    });

    it('a repeat of the current build (WS + GET race) keeps the entry animation running', () => {
      useGraphStore.getState().setData(makeGraph({ buildId: 5, nodes: [makeNode('a')] }));
      useGraphStore.getState().tickEntry(1);
      useGraphStore.setState({ loading: true, error: 'stale' });

      useGraphStore.getState().setData(makeGraph({ buildId: 5, nodes: [makeNode('a')] }));

      const s = useGraphStore.getState();
      expect(s.graphVersion).toBe(1);
      expect(s.entryProgress).toBeGreaterThan(0);
      expect(s.loading).toBe(false);
      expect(s.error).toBeNull();
    });

    it('an older build landing after a newer one does not replace it', () => {
      const newer = makeGraph({ buildId: 8, nodes: [makeNode('new')] });
      useGraphStore.getState().setData(newer);
      useGraphStore.getState().setData(makeGraph({ buildId: 7, nodes: [makeNode('old')] }));
      const s = useGraphStore.getState();
      expect(s.data).toBe(newer);
      expect(s.nodeMap.has('old')).toBe(false);
      expect(s.graphVersion).toBe(1);
    });

    it('two builds in the same millisecond are still two builds', () => {
      useGraphStore.getState().setData(makeGraph({ timestamp: 1000, buildId: 1 }));
      useGraphStore.getState().setData(makeGraph({ timestamp: 1000, buildId: 2 }));
      expect(useGraphStore.getState().graphVersion).toBe(2);
    });

    it('a restarted server (new epoch) is accepted even with a smaller build id', () => {
      useGraphStore.getState().setData(makeGraph({ buildEpoch: 'before-restart', buildId: 40 }));
      useGraphStore.getState().setData(makeGraph({ buildEpoch: 'after-restart', buildId: 1 }));
      expect(useGraphStore.getState().graphVersion).toBe(2);
    });

    it('a late copy from the process that restarted does not replace the new one (R575)', () => {
      useGraphStore.getState().setData(makeGraph({ buildEpoch: 'before-restart', buildId: 40 }));
      const fresh = makeGraph({ buildEpoch: 'after-restart', buildId: 1 });
      useGraphStore.getState().setData(fresh);
      // an open GET answered by the old process lands after the new server's broadcast
      useGraphStore.getState().setData(makeGraph({ buildEpoch: 'before-restart', buildId: 41 }));
      expect(useGraphStore.getState().data).toBe(fresh);
      expect(useGraphStore.getState().graphVersion).toBe(2);
      expect(useGraphStore.getState().loading).toBe(false);
    });

    it('triggers entry animation', () => {
      useGraphStore.getState().setData(makeGraph());

      const state = useGraphStore.getState();
      expect(state.entryProgress).toBe(0);
      expect(state.entryActive).toBe(true);
    });
  });

  describe('setBuildStatus (R575)', () => {
    const status = (valid: boolean, buildId: number, buildEpoch = 'epoch-1') => ({
      valid, nodeCount: valid ? 3 : 0, edgeCount: 0, errors: valid ? [] : ['Graph has 0 nodes — empty graph produced'],
      timestamp: 1_700_000_000_000, buildEpoch, buildId,
    });

    it('a failed latest build is shown with its time and errors; a later good build clears it', () => {
      useGraphStore.getState().setBuildStatus(status(false, 5));
      expect(useGraphStore.getState().buildFailure).toEqual({ at: 1_700_000_000_000, errors: ['Graph has 0 nodes — empty graph produced'] });
      useGraphStore.getState().setBuildStatus(status(true, 6));
      expect(useGraphStore.getState().buildFailure).toBeNull();
    });

    it('an older status landing after a newer one is ignored (GET /api/integrity vs WS push)', () => {
      useGraphStore.getState().setBuildStatus(status(true, 9));
      useGraphStore.getState().setBuildStatus(status(false, 8));
      expect(useGraphStore.getState().buildFailure).toBeNull();
    });

    it('a status from a restarted server is taken; the retired process cannot overwrite it', () => {
      useGraphStore.getState().setBuildStatus(status(false, 30, 'old'));
      useGraphStore.getState().setBuildStatus(status(true, 1, 'new'));
      expect(useGraphStore.getState().buildFailure).toBeNull();
      useGraphStore.getState().setBuildStatus(status(false, 31, 'old'));
      expect(useGraphStore.getState().buildFailure).toBeNull();
    });

    it('relayout (a new graph build id, no new status) leaves a failure in place', () => {
      useGraphStore.getState().setData(makeGraph({ buildId: 4 }));
      useGraphStore.getState().setBuildStatus(status(false, 5));
      useGraphStore.getState().setData(makeGraph({ buildId: 6 }));
      expect(useGraphStore.getState().buildFailure).not.toBeNull();
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
  describe('retarget', () => {
    const graph = () => makeGraph({
      nodes: [makeNode('a'), makeNode('b')],
      edges: [makeEdge('a', 'b')],
    });
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('socket down: fetches the graph and goes through setData (maps + entry animation)', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        calls.push(url);
        return url === '/api/graph' ? json(graph()) : json({ target: '/next', stats: {} });
      }));
      const err = await useGraphStore.getState().retarget(' /next ');
      const s = useGraphStore.getState();
      expect(err).toBeNull();
      expect(calls).toEqual(['/api/target', '/api/graph']);
      expect(s.adjacencyMap.get('a')?.has('b')).toBe(true);
      expect(s.nodeMap.size).toBe(2);
      expect(s.entryActive).toBe(true);
      expect(s.entryProgress).toBe(0);
      expect(s.graphVersion).toBe(1);
      expect(s.targetPath).toBe('/next');
      expect(s.loading).toBe(false);
    });

    it('refused target (422): reason returned, targetPath and graph unchanged, no global error', async () => {
      const shown = makeGraph({ nodes: [makeNode('kept')] });
      useGraphStore.getState().setData(shown);
      useGraphStore.setState({ targetPath: '/previous' });
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        calls.push(url);
        return { ok: false, status: 422, json: async () => ({ error: 'No supported source files in this directory (.ts)' }) };
      }));
      const err = await useGraphStore.getState().retarget('/empty');
      const s = useGraphStore.getState();
      expect(err).toBe('No supported source files in this directory (.ts)');
      expect(calls).toEqual(['/api/target']);
      expect(s.targetPath).toBe('/previous');
      expect(s.data).toBe(shown);
      expect(s.error).toBeNull();
      expect(s.loading).toBe(false);
    });

    it('server error (5xx) on the switch: may be half switched, so the error is global', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Internal server error' }) })));
      const err = await useGraphStore.getState().retarget('/next');
      expect(err).toBe('Internal server error');
      expect(useGraphStore.getState().error).toBe('Internal server error');
    });

    it('switched but the graph failed to load: targetPath follows the server and the error is global', async () => {
      useGraphStore.setState({ targetPath: '/previous' });
      vi.stubGlobal('fetch', vi.fn(async (url: string) => (
        url === '/api/graph' ? { ok: false, status: 500, json: async () => ({}) } : json({ target: '/next', stats: {} })
      )));
      const err = await useGraphStore.getState().retarget('/next');
      const s = useGraphStore.getState();
      expect(err).toMatch(/Switched to \/next/);
      expect(s.targetPath).toBe('/next');
      expect(s.error).toBe(err);
    });

    it('WebSocket copy of the same build landed first: the GET copy does not restart the entry animation', async () => {
      const calls: string[] = [];
      const build = graph();
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        calls.push(url);
        if (url === '/api/graph') return json(build);
        // the WS graph:update for this build lands while the POST is in flight
        useGraphStore.getState().setData(build);
        useGraphStore.getState().tickEntry(1);
        return json({ target: '/next', stats: {} });
      }));
      await useGraphStore.getState().retarget('/next');
      const s = useGraphStore.getState();
      expect(calls).toEqual(['/api/target', '/api/graph']);
      expect(s.graphVersion).toBe(1);
      expect(s.entryProgress).toBeGreaterThan(0);
      expect(s.targetPath).toBe('/next');
      expect(s.loading).toBe(false);
    });
  });
});
