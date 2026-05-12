import { Router } from 'express';
import type { ServerContext } from './types.js';

export function createGraphRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/graph', (_req, res) => {
    res.json(ctx.getGraphData());
  });

  router.get('/graph/node/:id', (req, res) => {
    const raw = req.params.id;
    if (raw.length > 8192) return res.status(400).json({ error: 'ID too long' });
    const nodeId = decodeURIComponent(raw);
    if (nodeId.length > 4096) return res.status(400).json({ error: 'ID too long' });

    const graphData = ctx.getGraphData();
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const connectedEdges = graphData.edges.filter(e => e.source === nodeId || e.target === nodeId);
    const connectedNodeIds = new Set(connectedEdges.flatMap(e => [e.source, e.target]));
    connectedNodeIds.delete(nodeId);
    const connectedNodes = graphData.nodes.filter(n => connectedNodeIds.has(n.id));

    res.json({ node, connectedEdges, connectedNodes });
  });

  router.get('/stats', (_req, res) => {
    res.json(ctx.getGraphData().stats);
  });

  return router;
}
