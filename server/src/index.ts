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
import { recordBuildMetrics, getBuildMetricsHistory, getLatestBuildMetrics, analyzeMetrics } from './metrics.js';
import type { GraphData } from './graph/types.js';

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

  graphData = buildGraph(parseResult.files, targetDir, { coChanges, fileGitMeta, fileAgentMeta });
  const buildDurationMs = Date.now() - start;

  // Record build metrics (L6 learning loop)
  recordBuildMetrics({
    timestamp: new Date().toISOString(),
    scannedFiles: parseResult.scannedCount,
    parseSuccessCount: parseResult.parseSuccessCount,
    parseFailureCount: parseResult.parseFailureCount,
    graphNodes: graphData.nodes.length,
    graphEdges: graphData.edges.length,
    buildDurationMs,
    languageBreakdown: { ...graphData.stats.languages },
    totalSymbols: graphData.stats.totalSymbols,
    totalDirs: graphData.stats.totalDirs,
  });

  console.log(`[StellaCode] Graph built: ${graphData.stats.totalFiles} files, ${graphData.stats.totalEdges} edges (${buildDurationMs}ms)`);
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
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; frame-ancestors 'none'",
  );
  next();
});

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

app.get('/api/agent/events', (_req, res) => {
  res.json(agentTracker.getEvents());
});

app.get('/api/agent/sessions', (_req, res) => {
  res.json(agentTracker.getSessions());
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
