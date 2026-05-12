import { Router } from 'express';
import { CONFIG } from '../config.js';
import type { ServerContext } from './types.js';

export function createGitRoutes(ctx: ServerContext): Router {
  const router = Router();

  router.get('/git/stats', (_req, res) => {
    res.json(ctx.agentTracker.getGitStats());
  });

  router.get('/git/log', (req, res) => {
    const raw = parseInt(String(req.query.limit ?? ''));
    const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 50, CONFIG.git.maxApiLogLimit);
    res.json(ctx.agentTracker.getGitLog(limit));
  });

  router.get('/git/branches', (_req, res) => {
    res.json(ctx.agentTracker.getBranches());
  });

  router.get('/timeline', (req, res) => {
    const raw = parseInt(String(req.query.limit ?? ''));
    const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 500, 1000);
    const commits = ctx.agentTracker.getTimeline(limit);
    const currentNodes = ctx.getGraphData().nodes.map(n => n.id);
    res.json({ commits, currentNodes });
  });

  router.get('/git/co-changes', (_req, res) => {
    const commits = ctx.agentTracker.getGitLog(CONFIG.git.coChangeLogLimit);
    res.json(ctx.agentTracker.getCoChanges(commits));
  });

  return router;
}
