import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject, clearParseCache } from './parser/index.js';
import { buildGraph } from './graph/builder.js';
import { computeLayout } from './graph/layout.js';
import { WsBroadcaster } from './ws.js';
import { createWatcher } from './watcher.js';
import { AgentTracker } from './agent/tracker.js';
import { LiveAgentWatcher } from './agent/live-watcher.js';
import { CONFIG } from './config.js';
import { recordBuildMetrics, analyzeMetrics } from './metrics.js';
import { createGraphRoutes } from './routes/graph.js';
import { createGitRoutes } from './routes/git.js';
import { createMetricsRoutes } from './routes/metrics.js';
import {
  createQualityRoutes,
  judgeGraphQuality, broadcastQualityReport, verifyGraphIntegrity,
  type IntegrityResult,
} from './routes/quality.js';
import type { GraphData } from './graph/types.js';
import type { ServerContext } from './routes/types.js';

const PORT = CONFIG.port;

// Parse --target flag or use env/default
function getTarget(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--target');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const positional = args.find(a => !a.startsWith('-'));
  if (positional) return positional;
  return process.env.STELLA_TARGET ?? '.';
}

let targetDir = path.resolve(getTarget());

console.log(`[StellaCode] Target: ${targetDir}`);
console.log(`[StellaCode] Port: ${PORT}`);

// Agent tracker
const agentTracker = new AgentTracker(targetDir);

// Parse project
let graphData: GraphData;
let lastParseSuccessCount = 0;
let lastParseFailureCount = 0;
let lastIntegrityResult: IntegrityResult | null = null;

interface CandidateBuild {
  graph: GraphData;
  integrity: IntegrityResult;
  parseSuccessCount: number;
  parseFailureCount: number;
  scannedCount: number;
  buildDurationMs: number;
}

/** Parse `dir`, build its graph and verify it. Nothing is published here. */
function buildCandidate(dir: string, tracker: AgentTracker): CandidateBuild {
  const start = Date.now();
  const parseResult = parseProject(dir);

  let coChanges;
  let fileGitMeta;
  let fileAgentMeta;
  if (tracker.isGit) {
    const commits = tracker.getGitLog(CONFIG.graphCoChangeLimit);
    coChanges = tracker.getCoChanges(commits);
    fileGitMeta = tracker.getFileGitMeta(commits);
    fileAgentMeta = tracker.getFileAgentMeta(commits);
  }

  const candidateGraph = buildGraph(parseResult.files, dir, { coChanges, fileGitMeta, fileAgentMeta });
  const buildDurationMs = Date.now() - start;

  // L3: Verify integrity
  const integrity = verifyGraphIntegrity(candidateGraph);
  if (!integrity.valid) {
    console.error(`[L3:IntegrityCheck] FAILED — ${integrity.errors.length} error(s):`);
    for (const err of integrity.errors) {
      console.error(`  - ${err}`);
    }
  }

  console.log(`[StellaCode] Graph built: ${candidateGraph.stats.totalFiles} files, ${candidateGraph.stats.totalEdges} edges (${buildDurationMs}ms)${integrity.valid ? '' : ' [INTEGRITY ERRORS]'}`);

  return {
    graph: candidateGraph,
    integrity,
    parseSuccessCount: parseResult.parseSuccessCount,
    parseFailureCount: parseResult.parseFailureCount,
    scannedCount: parseResult.scannedCount,
    buildDurationMs,
  };
}

/**
 * Record a build of the current target as its L3 result and L6 metrics. A directory
 * refused by switchTarget never becomes the target, so it is not recorded here —
 * /api/integrity and the metrics keep describing the project that is on screen.
 */
function recordTargetBuild(build: CandidateBuild) {
  lastIntegrityResult = build.integrity;
  const g = build.graph;
  recordBuildMetrics({
    timestamp: new Date().toISOString(),
    scannedFiles: build.scannedCount,
    parseSuccessCount: build.parseSuccessCount,
    parseFailureCount: build.parseFailureCount,
    graphNodes: g.nodes.length,
    graphEdges: g.edges.length,
    buildDurationMs: build.buildDurationMs,
    languageBreakdown: { ...g.stats.languages },
    totalSymbols: g.stats.totalSymbols,
    totalDirs: g.stats.totalDirs,
  });
  analyzeMetrics();
}

function commitBuild(build: CandidateBuild) {
  graphData = build.graph;
  lastParseSuccessCount = build.parseSuccessCount;
  lastParseFailureCount = build.parseFailureCount;
}

/**
 * Rebuild the current target (startup and file changes). A build that fails the
 * integrity check keeps the previous graph of the same project — a half-saved file
 * should not blank the view. With no previous graph the candidate is all there is.
 */
function rebuildGraph() {
  const build = buildCandidate(targetDir, agentTracker);
  recordTargetBuild(build);
  if (build.integrity.valid || !graphData) {
    if (!build.integrity.valid) console.warn('[L3:IntegrityCheck] No previous graph — using candidate despite errors');
    commitBuild(build);
  } else {
    console.warn('[L3:IntegrityCheck] Retaining previous valid graph');
  }
}

rebuildGraph();

// Express app
const app = express();

// ── Security middleware ──
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://127.0.0.1:${PORT}`,
  ...(process.env.STELLA_CORS_ORIGINS
    ? process.env.STELLA_CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked'));
    }
  },
}));

app.use(express.json({ limit: '1mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const cspConnectSrc = `'self' ws://localhost:${PORT} ws://127.0.0.1:${PORT} ws://localhost:5173 ws://127.0.0.1:5173`;
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src ${cspConnectSrc}; frame-ancestors 'none'`,
  );
  next();
});

// ── Rate limiter ──
const _rateLimitStore = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

app.use('/api/', (req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined)
    || req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const timestamps = _rateLimitStore.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  recent.push(now);
  _rateLimitStore.set(ip, recent);
  next();
});

setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of _rateLimitStore) {
    const recent = timestamps.filter(t => t > cutoff);
    if (recent.length === 0) _rateLimitStore.delete(ip);
    else _rateLimitStore.set(ip, recent);
  }
}, 5 * 60_000);

// HTTP server + WebSocket
const server = http.createServer(app);
const broadcaster = new WsBroadcaster(server);

// L2=8: Initialize quality timeseries persistence
broadcaster.usageTracker.initTimeseries(path.join(targetDir, '.stellacode', 'data'));

// ── Usage tracking middleware (L2) ──
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    const tracker = broadcaster.usageTracker;
    for (const sessionId of broadcaster.getActiveSessionIds()) {
      tracker.recordFeatureAccess(sessionId, req.path);
    }
  }
  next();
});

// ── Serve client static files in production ──
const __serverDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__serverDir, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistPath) && fs.statSync(clientDistPath).isDirectory()) {
  console.log(`[StellaCode] Serving client from ${clientDistPath}`);
  app.use(express.static(clientDistPath));
}

// Live agent watcher
let liveWatcher = new LiveAgentWatcher(targetDir, (event) => {
  broadcaster.broadcast('agent:live', event);
});

// File watcher
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

function onFileChange(event: { type: string; relativePath: string; filePath: string; timestamp: number }) {
  console.log(`[Watch] ${event.type}: ${event.relativePath}`);

  const agentEvent = agentTracker.trackFileChange(
    event.relativePath,
    event.type === 'add' ? 'file_create' : event.type === 'unlink' ? 'file_delete' : 'file_edit'
  );

  broadcaster.broadcast('file:change', { ...event, agentEvent });

  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(() => {
    rebuildGraph();
    broadcaster.broadcast('graph:update', graphData);
    const report = judgeGraphQuality(graphData, lastParseSuccessCount, lastParseFailureCount);
    broadcastQualityReport(broadcaster, report);
  }, CONFIG.watcher.rebuildDelay);
}

let activeWatcher = createWatcher(targetDir, onFileChange);

/**
 * Point the server at another directory. The candidate graph is built first and the
 * switch happens only if it passes the integrity check — a rejected directory leaves
 * the target, watchers, agent history and published graph exactly as they were.
 * (Undoing a switch afterwards would not: agentTracker.updateTarget clears its events.)
 */
function switchTarget(dir: string): IntegrityResult {
  // The parse cache is keyed by relative path, so another root must not read it.
  clearParseCache();
  const build = buildCandidate(dir, new AgentTracker(dir));
  if (!build.integrity.valid) {
    clearParseCache();
    console.warn(`[StellaCode] Target rejected, staying on ${targetDir}`);
    return build.integrity;
  }

  activeWatcher.close();
  targetDir = dir;
  activeWatcher = createWatcher(dir, onFileChange);
  liveWatcher.updateTarget(dir);
  agentTracker.updateTarget(dir);
  recordTargetBuild(build);
  commitBuild(build);
  console.log(`[StellaCode] Target changed: ${dir}`);
  return build.integrity;
}

// ── Server context for route modules ──
const ctx: ServerContext = {
  getGraphData: () => graphData,
  getTargetDir: () => targetDir,
  switchTarget,
  agentTracker,
  broadcaster,
  getParseSuccessCount: () => lastParseSuccessCount,
  getParseFailureCount: () => lastParseFailureCount,
};

// ── Mount route modules ──
app.use('/api', createGraphRoutes(ctx));
app.use('/api', createGitRoutes(ctx));
app.use('/api', createMetricsRoutes(ctx));
app.use('/api', createQualityRoutes(ctx, () => lastIntegrityResult));

// ── SPA fallback ──
const indexHtmlPath = path.join(clientDistPath, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/ws')) {
      res.sendFile(indexHtmlPath);
    } else {
      next();
    }
  });
}

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[StellaCode] Server running at http://localhost:${PORT}`);
  console.log(`[StellaCode] WebSocket at ws://localhost:${PORT}/ws`);
  console.log(`[StellaCode] API: GET /api/graph, /api/stats, /api/target`);
  const initialReport = judgeGraphQuality(graphData, lastParseSuccessCount, lastParseFailureCount);
  if (!initialReport.passed) {
    for (const alert of initialReport.alerts) {
      console.log(`[QualityJudge] ${alert.level.toUpperCase()}: ${alert.message}`);
    }
  }
});

// Graceful shutdown
function shutdown() {
  console.log('[StellaCode] Shutting down...');
  activeWatcher.close();
  liveWatcher.close();
  broadcaster.close();
  server.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
  console.error('[StellaCode] Unhandled rejection:', reason);
});
