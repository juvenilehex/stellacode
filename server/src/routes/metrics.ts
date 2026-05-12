import { Router } from 'express';
import { getBuildMetricsHistory, getLatestBuildMetrics, analyzeMetrics, getAdjustmentLog } from '../metrics.js';
import { CONFIG } from '../config.js';
import type { ServerContext } from './types.js';

export function createMetricsRoutes(_ctx: ServerContext): Router {
  const router = Router();

  router.get('/metrics', (req, res) => {
    const raw = parseInt(String(req.query.limit ?? ''));
    const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 100, 100);
    const history = getBuildMetricsHistory();
    const latest = getLatestBuildMetrics();
    res.json({
      latest,
      history: history.slice(-limit),
      totalBuilds: history.length,
    });
  });

  router.get('/metrics/analysis', (_req, res) => {
    res.json(analyzeMetrics());
  });

  router.get('/metrics/adjustments', (_req, res) => {
    res.json({ adjustments: getAdjustmentLog(), currentConfig: { rebuildDelay: CONFIG.watcher.rebuildDelay } });
  });

  return router;
}
