import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { computeLayout } from '../graph/layout.js';
import type { GraphData } from '../graph/types.js';
import type { WsBroadcaster } from '../ws.js';
import type { ServerContext } from './types.js';

// ── L5: Autonomous quality judgment ──

export interface QualityAlert {
  level: 'warning' | 'critical';
  category: 'parse-failure' | 'island-files' | 'circular-dependency';
  message: string;
  metric: number;
  threshold: number;
  affectedNodes?: string[];
}

export interface QualityReport {
  timestamp: number;
  alerts: QualityAlert[];
  passed: boolean;
}

export function judgeGraphQuality(
  data: GraphData,
  parseSuccessCount: number,
  parseFailureCount: number,
): QualityReport {
  if (CONFIG.killSwitch.disableQualityJudge) {
    return { timestamp: Date.now(), alerts: [], passed: true };
  }
  const alerts: QualityAlert[] = [];

  // 1. Parse failure rate > 10%
  const totalScanned = parseSuccessCount + parseFailureCount;
  if (totalScanned > 0) {
    const failureRate = parseFailureCount / totalScanned;
    if (failureRate > 0.1) {
      alerts.push({
        level: failureRate > 0.3 ? 'critical' : 'warning',
        category: 'parse-failure',
        message: `Parse failure rate ${(failureRate * 100).toFixed(1)}% exceeds 10% (${parseFailureCount}/${totalScanned} files)`,
        metric: Math.round(failureRate * 1000) / 10,
        threshold: 10,
      });
    }
  }

  // 2. Island files ratio > 20%
  const fileNodes = data.nodes.filter(n => n.type === 'file');
  if (fileNodes.length > 0) {
    const islandNodes = fileNodes.filter(n => n.meta?.islandFile === true);
    const islandRate = islandNodes.length / fileNodes.length;
    if (islandRate > 0.2) {
      alerts.push({
        level: 'warning',
        category: 'island-files',
        message: `Island file ratio ${(islandRate * 100).toFixed(1)}% exceeds 20% (${islandNodes.length}/${fileNodes.length} files). Consider reviewing code structure.`,
        metric: Math.round(islandRate * 1000) / 10,
        threshold: 20,
        affectedNodes: islandNodes.map(n => n.id),
      });
    }
  }

  // 3. Circular dependency detection
  const circularEdges = data.edges.filter(e => e.label?.includes('circular'));
  if (circularEdges.length > 0) {
    const affectedNodeIds = new Set<string>();
    for (const edge of circularEdges) {
      affectedNodeIds.add(edge.source);
      affectedNodeIds.add(edge.target);
    }
    alerts.push({
      level: 'warning',
      category: 'circular-dependency',
      message: `${circularEdges.length} circular dependency edge(s) detected across ${affectedNodeIds.size} files. Refactoring recommended.`,
      metric: circularEdges.length,
      threshold: 0,
      affectedNodes: [...affectedNodeIds],
    });
  }

  return { timestamp: Date.now(), alerts, passed: alerts.length === 0 };
}

export function broadcastQualityReport(ws: WsBroadcaster, report: QualityReport): void {
  if (report.alerts.length === 0) return;
  for (const alert of report.alerts) {
    console.log(`[QualityJudge] ${alert.level.toUpperCase()}: ${alert.message}`);
  }
  ws.broadcast('quality:alert', report);
}

// ── L3: Runtime graph integrity verification ──

export interface IntegrityResult {
  valid: boolean;
  nodeCount: number;
  edgeCount: number;
  errors: string[];
  timestamp: number;
}

export function verifyGraphIntegrity(data: GraphData): IntegrityResult {
  const errors: string[] = [];

  if (data.nodes.length === 0) {
    errors.push('Graph has 0 nodes — empty graph produced');
  }

  const nodeIds = new Set(data.nodes.map(n => n.id));
  for (const edge of data.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${edge.id}: source "${edge.source}" references non-existent node`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id}: target "${edge.target}" references non-existent node`);
    }
  }

  const cappedErrors = errors.length > 20
    ? [...errors.slice(0, 20), `... and ${errors.length - 20} more errors`]
    : errors;

  return {
    valid: errors.length === 0,
    nodeCount: data.nodes.length,
    edgeCount: data.edges.length,
    errors: cappedErrors,
    timestamp: Date.now(),
  };
}

export function createQualityRoutes(ctx: ServerContext, getIntegrity: () => IntegrityResult | null): Router {
  const router = Router();

  // L5: Quality judgment
  router.get('/quality', (_req, res) => {
    res.json(judgeGraphQuality(ctx.getGraphData(), ctx.getParseSuccessCount(), ctx.getParseFailureCount()));
  });

  // Agent endpoints
  router.get('/agent/events', (_req, res) => {
    res.json(ctx.agentTracker.getEvents());
  });

  router.get('/agent/sessions', (_req, res) => {
    res.json(ctx.agentTracker.getSessions());
  });

  // L5: Kill switch API
  router.get('/kill-switch', (_req, res) => {
    res.json(CONFIG.killSwitch);
  });

  router.post('/kill-switch/:target', (req, res) => {
    const target = req.params.target;
    const { enabled } = req.body ?? {};
    const validTargets = ['disableAutoAdjust', 'disableAutoRebuild', 'disableQualityJudge'];
    if (target === 'all') {
      const value = enabled !== false;
      for (const t of validTargets) {
        (CONFIG.killSwitch as Record<string, boolean>)[t] = value;
      }
      console.log(`[L5:KillSwitch] ALL ${value ? 'ACTIVATED' : 'deactivated'}`);
      return res.json({ killSwitch: CONFIG.killSwitch });
    }
    if (!validTargets.includes(target)) {
      return res.status(400).json({ error: `Invalid target. Valid: ${validTargets.join(', ')}, all` });
    }
    const value = enabled !== false;
    (CONFIG.killSwitch as Record<string, boolean>)[target] = value;
    console.log(`[L5:KillSwitch] ${target} = ${value}`);
    res.json({ killSwitch: CONFIG.killSwitch });
  });

  // Target API
  router.get('/target', (_req, res) => {
    res.json({ target: ctx.getTargetDir() });
  });

  router.post('/target', (req, res) => {
    const { path: newTarget } = req.body;
    if (!newTarget || typeof newTarget !== 'string') {
      return res.status(400).json({ error: 'path is required' });
    }

    if (newTarget.includes('\0') || /\.\.[/\\]/.test(newTarget)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const resolved = path.resolve(newTarget);

    const blocked = ['/etc', '/var', '/proc', '/sys', '/dev', 'C:\\Windows', 'C:\\Program Files'];
    if (blocked.some(b => resolved.toLowerCase().startsWith(b.toLowerCase()))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      if (!fs.statSync(resolved).isDirectory()) {
        return res.status(400).json({ error: 'Not a directory' });
      }
    } catch (err) {
      console.warn('[API] Target directory stat failed:', (err as Error).message);
      return res.status(400).json({ error: 'Directory not found' });
    }

    ctx.setTargetDir(resolved);
    console.log(`[StellaCode] Target changed: ${resolved}`);

    // Restart watchers (handled by ServerContext)
    ctx.getActiveWatcher().close();
    ctx.getLiveWatcher().updateTarget(resolved);

    ctx.agentTracker.updateTarget(resolved);
    ctx.rebuildGraph();
    ctx.broadcaster.broadcast('graph:update', ctx.getGraphData());

    const report = judgeGraphQuality(ctx.getGraphData(), ctx.getParseSuccessCount(), ctx.getParseFailureCount());
    broadcastQualityReport(ctx.broadcaster, report);

    res.json({ target: resolved, stats: ctx.getGraphData().stats });
  });

  // L3: Graph integrity endpoint
  router.get('/integrity', (_req, res) => {
    const result = getIntegrity();
    if (!result) {
      return res.json({ valid: true, nodeCount: 0, edgeCount: 0, errors: [], timestamp: 0, message: 'No builds yet' });
    }
    res.json(result);
  });

  // Usage feedback API (L2)
  router.get('/feedback/usage', (req, res) => {
    const raw = parseInt(String(req.query.limit ?? ''));
    const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 20, 50);
    res.json(ctx.broadcaster.usageTracker.getSummary(limit));
  });

  router.get('/feedback/insights', (_req, res) => {
    res.json(ctx.broadcaster.usageTracker.getInsights());
  });

  // Relayout API
  router.post('/relayout', (req, res) => {
    const { dirCohesion } = req.body ?? {};
    const raw = typeof dirCohesion === 'number' && Number.isFinite(dirCohesion) ? dirCohesion : 50;
    const cohesionValue = Math.max(0, Math.min(100, raw));

    const multiplier = cohesionValue <= 50
      ? 0.1 + (cohesionValue / 50) * 0.9
      : 1.0 + ((cohesionValue - 50) / 50) * 2.0;

    const graphData = ctx.getGraphData();
    computeLayout(graphData.nodes, graphData.edges, { dirCohesion: multiplier });
    graphData.timestamp = Date.now();

    ctx.broadcaster.broadcast('graph:update', graphData);
    res.json({ dirCohesion: cohesionValue, multiplier });
  });

  return router;
}
