import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject } from './parser/index.js';
import { buildGraph } from './graph/builder.js';
import { computeLayout } from './graph/layout.js';
import { WsBroadcaster } from './ws.js';
import { createWatcher } from './watcher.js';
import { AgentTracker } from './agent/tracker.js';
import { LiveAgentWatcher } from './agent/live-watcher.js';
import { CONFIG } from './config.js';
import { recordBuildMetrics, getBuildMetricsHistory, getLatestBuildMetrics, analyzeMetrics, getAdjustmentLog } from './metrics.js';
import type { GraphData } from './graph/types.js';
import type { WsBroadcaster as WsBroadcasterType } from './ws.js';

// ── L5: Autonomous quality judgment after each graph build ──

interface QualityAlert {
  level: 'warning' | 'critical';
  category: 'parse-failure' | 'island-files' | 'circular-dependency';
  message: string;
  metric: number;
  threshold: number;
  /** Affected node IDs for client-side highlighting */
  affectedNodes?: string[];
}

interface QualityReport {
  timestamp: number;
  alerts: QualityAlert[];
  passed: boolean;
}

function judgeGraphQuality(
  data: GraphData,
  parseSuccessCount: number,
  parseFailureCount: number,
): QualityReport {
  // L5 Kill switch: skip quality judgment when disabled
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

  // 2. Island files (no incoming imports, no exports) ratio > 20%
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

  // 3. Circular dependency detection — find edges labelled 'circular'
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

  return {
    timestamp: Date.now(),
    alerts,
    passed: alerts.length === 0,
  };
}

function broadcastQualityReport(ws: WsBroadcasterType, report: QualityReport): void {
  if (report.alerts.length === 0) return;
  for (const alert of report.alerts) {
    console.log(`[QualityJudge] ${alert.level.toUpperCase()}: ${alert.message}`);
  }
  ws.broadcast('quality:alert', report);
}

// ── L3: Runtime graph integrity verification after each build ──

interface IntegrityResult {
  valid: boolean;
  nodeCount: number;
  edgeCount: number;
  errors: string[];
  timestamp: number;
}

function verifyGraphIntegrity(data: GraphData): IntegrityResult {
  const errors: string[] = [];

  // 1. Graph must have at least one node
  if (data.nodes.length === 0) {
    errors.push('Graph has 0 nodes — empty graph produced');
  }

  // 2. All edge source/target must reference existing node IDs
  const nodeIds = new Set(data.nodes.map(n => n.id));
  for (const edge of data.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${edge.id}: source "${edge.source}" references non-existent node`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${edge.id}: target "${edge.target}" references non-existent node`);
    }
  }

  // Cap error messages to avoid log spam on severely broken graphs
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

/** Last integrity check result (exposed via /api/integrity) */
let lastIntegrityResult: IntegrityResult | null = null;

function rebuildGraph() {
  const start = Date.now();
  const parseResult = parseProject(targetDir);

  let coChanges;
  let fileGitMeta;
  let fileAgentMeta;
  if (agentTracker.isGit) {
    const commits = agentTracker.getGitLog(CONFIG.graphCoChangeLimit);
    coChanges = agentTracker.getCoChanges(commits);
    fileGitMeta = agentTracker.getFileGitMeta(commits);
    fileAgentMeta = agentTracker.getFileAgentMeta(commits);
  }

  const candidateGraph = buildGraph(parseResult.files, targetDir, { coChanges, fileGitMeta, fileAgentMeta });
  const buildDurationMs = Date.now() - start;

  // L3: Verify integrity of the newly built graph
  const integrity = verifyGraphIntegrity(candidateGraph);
  lastIntegrityResult = integrity;

  if (!integrity.valid) {
    console.error(`[L3:IntegrityCheck] FAILED — ${integrity.errors.length} error(s):`);
    for (const err of integrity.errors) {
      console.error(`  - ${err}`);
    }
    // Keep previous graphData to avoid serving broken data.
    // But still update parse counts and record metrics so L6 can track the failure.
    if (graphData) {
      console.warn('[L3:IntegrityCheck] Retaining previous valid graph');
    } else {
      // First build ever — no previous graph to retain, use candidate anyway
      graphData = candidateGraph;
      console.warn('[L3:IntegrityCheck] No previous graph — using candidate despite errors');
    }
  } else {
    graphData = candidateGraph;
  }

  // Store parse counts for quality judgment
  lastParseSuccessCount = parseResult.parseSuccessCount;
  lastParseFailureCount = parseResult.parseFailureCount;

  // Record build metrics (L6 learning loop)
  recordBuildMetrics({
    timestamp: new Date().toISOString(),
    scannedFiles: parseResult.scannedCount,
    parseSuccessCount: parseResult.parseSuccessCount,
    parseFailureCount: parseResult.parseFailureCount,
    graphNodes: candidateGraph.nodes.length,
    graphEdges: candidateGraph.edges.length,
    buildDurationMs,
    languageBreakdown: { ...candidateGraph.stats.languages },
    totalSymbols: candidateGraph.stats.totalSymbols,
    totalDirs: candidateGraph.stats.totalDirs,
  });

  // L6: Run analysis — this may auto-adjust CONFIG based on trends
  analyzeMetrics();

  console.log(`[StellaCode] Graph built: ${candidateGraph.stats.totalFiles} files, ${candidateGraph.stats.totalEdges} edges (${buildDurationMs}ms)${integrity.valid ? '' : ' [INTEGRITY ERRORS]'}`);
}

rebuildGraph();

// Express app
const app = express();

// ── Security middleware ──
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  'http://localhost:5173',   // Vite dev server
  'http://127.0.0.1:5173',
  `http://127.0.0.1:${PORT}`,
  ...(process.env.STELLA_CORS_ORIGINS
    ? process.env.STELLA_CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, same-origin)
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
  // CSP: restrict resource loading to same origin; API responses are JSON so
  // script/style directives are irrelevant, but browsers enforce CSP on the
  // served client HTML too — block all external resource origins.
  // 'unsafe-eval' is required by Three.js/React-Three-Fiber GLSL shader compilation.
  // blob: on worker-src is required for Three.js inline worker threads.
  // blob: on img-src is required for Three.js canvas/texture data URLs.
  // CSP connect-src scoped to the configured port instead of wildcard ws://localhost:*
  // In dev mode Vite runs on 5173 and proxies WS to the server port
  const cspConnectSrc = `'self' ws://localhost:${PORT} ws://127.0.0.1:${PORT} ws://localhost:5173 ws://127.0.0.1:5173`;
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src ${cspConnectSrc}; frame-ancestors 'none'`,
  );
  next();
});

// ── L7: Simple in-memory rate limiter for API endpoints ──
const _rateLimitStore = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 120;          // 120 requests per minute per IP

app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
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

// Periodic cleanup of rate limit store (every 5 minutes)
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of _rateLimitStore) {
    const recent = timestamps.filter(t => t > cutoff);
    if (recent.length === 0) _rateLimitStore.delete(ip);
    else _rateLimitStore.set(ip, recent);
  }
}, 5 * 60_000);

// ── Usage tracking middleware (L2 — record feature access per active session) ──
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

// API routes
app.get('/api/graph', (_req, res) => {
  res.json(graphData);
});

app.get('/api/graph/node/:id', (req, res) => {
  // Bound the decoded ID length — file paths in real projects rarely exceed
  // 4096 chars; reject anything longer to prevent O(n) scan on a huge string.
  const raw = req.params.id;
  if (raw.length > 8192) return res.status(400).json({ error: 'ID too long' });
  const nodeId = decodeURIComponent(raw);
  if (nodeId.length > 4096) return res.status(400).json({ error: 'ID too long' });
  const node = graphData.nodes.find(n => n.id === nodeId);
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const connectedEdges = graphData.edges.filter(e => e.source === nodeId || e.target === nodeId);
  const connectedNodeIds = new Set(connectedEdges.flatMap(e => [e.source, e.target]));
  connectedNodeIds.delete(nodeId);
  const connectedNodes = graphData.nodes.filter(n => connectedNodeIds.has(n.id));

  res.json({ node, connectedEdges, connectedNodes });
});

app.get('/api/stats', (_req, res) => {
  res.json(graphData.stats);
});

app.get('/api/metrics', (req, res) => {
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

app.get('/api/metrics/analysis', (_req, res) => {
  res.json(analyzeMetrics());
});

// L5: Quality judgment endpoint (autonomous assessment on demand)
app.get('/api/quality', (_req, res) => {
  res.json(judgeGraphQuality(graphData, lastParseSuccessCount, lastParseFailureCount));
});

app.get('/api/agent/events', (_req, res) => {
  res.json(agentTracker.getEvents());
});

app.get('/api/agent/sessions', (_req, res) => {
  res.json(agentTracker.getSessions());
});

// ── L5: Kill switch API (emergency stop + instant rollback) ──

app.get('/api/kill-switch', (_req, res) => {
  res.json(CONFIG.killSwitch);
});

app.post('/api/kill-switch/:target', (req, res) => {
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

// ── Target API ──

app.get('/api/target', (_req, res) => {
  res.json({ target: targetDir });
});

app.post('/api/target', (req, res) => {
  const { path: newTarget } = req.body;
  if (!newTarget || typeof newTarget !== 'string') {
    return res.status(400).json({ error: 'path is required' });
  }

  // Reject null bytes and suspicious patterns
  if (newTarget.includes('\0') || /\.\.[/\\]/.test(newTarget)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const resolved = path.resolve(newTarget);

  // Block sensitive directories
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

  // Switch target
  targetDir = resolved;
  console.log(`[StellaCode] Target changed: ${resolved}`);

  // Restart watchers
  activeWatcher.close();
  activeWatcher = createWatcher(resolved, onFileChange);
  liveWatcher.updateTarget(resolved);

  // Rebuild everything
  agentTracker.updateTarget(resolved);
  rebuildGraph();
  broadcaster.broadcast('graph:update', graphData);
  // L5: Autonomous quality judgment after target change
  const report = judgeGraphQuality(graphData, lastParseSuccessCount, lastParseFailureCount);
  broadcastQualityReport(broadcaster, report);

  res.json({ target: resolved, stats: graphData.stats });
});

// ── Git API ──

app.get('/api/git/stats', (_req, res) => {
  res.json(agentTracker.getGitStats());
});

app.get('/api/git/log', (req, res) => {
  // Use String() to safely handle array values (e.g. ?limit=1&limit=2 → "1,2" → NaN → default)
  const raw = parseInt(String(req.query.limit ?? ''));
  const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 50, CONFIG.git.maxApiLogLimit);
  res.json(agentTracker.getGitLog(limit));
});

app.get('/api/git/branches', (_req, res) => {
  res.json(agentTracker.getBranches());
});

app.get('/api/timeline', (req, res) => {
  const raw = parseInt(String(req.query.limit ?? ''));
  const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 500, 1000);
  const commits = agentTracker.getTimeline(limit);
  const currentNodes = graphData.nodes.map(n => n.id);
  res.json({ commits, currentNodes });
});

app.get('/api/git/co-changes', (_req, res) => {
  const commits = agentTracker.getGitLog(CONFIG.git.coChangeLogLimit);
  res.json(agentTracker.getCoChanges(commits));
});

// ── Usage Feedback API (L2 quality loop) ──

app.get('/api/feedback/usage', (req, res) => {
  const raw = parseInt(String(req.query.limit ?? ''));
  const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 20, 50);
  res.json(broadcaster.usageTracker.getSummary(limit));
});

// ── L2: Usage insights endpoint (feedback → behavior change) ──

app.get('/api/feedback/insights', (_req, res) => {
  res.json(broadcaster.usageTracker.getInsights());
});

// ── L3: Graph integrity endpoint ──

app.get('/api/integrity', (_req, res) => {
  if (!lastIntegrityResult) {
    return res.json({ valid: true, nodeCount: 0, edgeCount: 0, errors: [], timestamp: 0, message: 'No builds yet' });
  }
  res.json(lastIntegrityResult);
});

// ── L6: Config adjustments log endpoint ──

app.get('/api/metrics/adjustments', (_req, res) => {
  res.json({ adjustments: getAdjustmentLog(), currentConfig: { rebuildDelay: CONFIG.watcher.rebuildDelay } });
});

// ── Relayout API ──

app.post('/api/relayout', (req, res) => {
  const { dirCohesion } = req.body ?? {};
  const raw = typeof dirCohesion === 'number' && Number.isFinite(dirCohesion) ? dirCohesion : 50;
  const cohesionValue = Math.max(0, Math.min(100, raw));

  // Map 0-100 slider to multiplier: 0→0.1x, 50→1.0x, 100→3.0x
  const multiplier = cohesionValue <= 50
    ? 0.1 + (cohesionValue / 50) * 0.9    // 0→0.1, 50→1.0
    : 1.0 + ((cohesionValue - 50) / 50) * 2.0; // 50→1.0, 100→3.0

  // Re-run layout on existing nodes/edges with new cohesion
  computeLayout(graphData.nodes, graphData.edges, { dirCohesion: multiplier });
  graphData.timestamp = Date.now();

  broadcaster.broadcast('graph:update', graphData);
  res.json({ dirCohesion: cohesionValue, multiplier });
});

// HTTP server
const server = http.createServer(app);
const broadcaster = new WsBroadcaster(server);

// Live agent watcher (Claude Code JSONL real-time parsing)
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
    // L5: Autonomous quality judgment after rebuild
    const report = judgeGraphQuality(graphData, lastParseSuccessCount, lastParseFailureCount);
    broadcastQualityReport(broadcaster, report);
  }, CONFIG.watcher.rebuildDelay);
}

let activeWatcher = createWatcher(targetDir, onFileChange);

// ── SPA fallback: serve index.html for non-API routes in production ──
const indexHtmlPath = path.join(clientDistPath, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  app.use((req, res, next) => {
    // Only handle GET requests for non-API, non-WS paths
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/ws')) {
      res.sendFile(indexHtmlPath);
    } else {
      next();
    }
  });
}

// Global error handler — catch unhandled route errors
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[StellaCode] Server running at http://localhost:${PORT}`);
  console.log(`[StellaCode] WebSocket at ws://localhost:${PORT}/ws`);
  console.log(`[StellaCode] API: GET /api/graph, /api/stats, /api/target`);
  // L5: Run quality judgment on initial build (log-only, no WS clients yet)
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

// Prevent crash on unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error('[StellaCode] Unhandled rejection:', reason);
});
