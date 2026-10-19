import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WsBroadcaster } from './ws.js';
import type { FileChangeEvent } from './watcher.js';
import { TargetSession } from './target-session.js';
import { CONFIG } from './config.js';
import { createGraphRoutes } from './routes/graph.js';
import { createGitRoutes } from './routes/git.js';
import { createMetricsRoutes } from './routes/metrics.js';
import { createQualityRoutes, judgeGraphQuality, broadcastQualityReport } from './routes/quality.js';
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

const initialTarget = path.resolve(getTarget());

console.log(`[StellaCode] Target: ${initialTarget}`);
console.log(`[StellaCode] Port: ${PORT}`);

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

const rateLimitSweep = setInterval(() => {
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
broadcaster.usageTracker.initTimeseries(path.join(initialTarget, '.stellacode', 'data'));

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

// File watcher → debounced rebuild of the session's current target
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

function onFileChange(event: FileChangeEvent) {
  if (shuttingDown) return;
  console.log(`[Watch] ${event.type}: ${event.relativePath}`);

  const agentEvent = session.agentTracker.trackFileChange(
    event.relativePath,
    event.type === 'add' ? 'file_create' : event.type === 'unlink' ? 'file_delete' : 'file_edit'
  );

  broadcaster.broadcast('file:change', { ...event, agentEvent });

  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(() => {
    session.rebuild();
    const graphData = session.getGraphData();
    broadcaster.broadcast('graph:update', graphData);
    const report = judgeGraphQuality(graphData, session.getParseSuccessCount(), session.getParseFailureCount());
    broadcastQualityReport(broadcaster, report);
  }, CONFIG.watcher.rebuildDelay);
}

// Builds the initial target and starts the file and live-agent watchers.
const session = new TargetSession(initialTarget, {
  onFileChange,
  onLiveEvent: (event) => broadcaster.broadcast('agent:live', event),
  // Every recorded build of the target (a retained-graph failure included) — the
  // client shows a failed latest build next to the graph it kept.
  onBuildRecorded: (integrity) => broadcaster.broadcast('build:integrity', integrity),
});

// ── Server context for route modules ──
const ctx: ServerContext = { session, broadcaster };

// ── Mount route modules ──
app.use('/api', createGraphRoutes(ctx));
app.use('/api', createGitRoutes(ctx));
app.use('/api', createMetricsRoutes(ctx));
app.use('/api', createQualityRoutes(ctx));

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
  const initialReport = judgeGraphQuality(session.getGraphData(), session.getParseSuccessCount(), session.getParseFailureCount());
  if (!initialReport.passed) {
    for (const alert of initialReport.alerts) {
      console.log(`[QualityJudge] ${alert.level.toUpperCase()}: ${alert.message}`);
    }
  }
});

// Graceful shutdown. Every handle is released so the process ends on its own with
// exit code 0; a handle left open would keep it running, so a deadline exits with 1
// and names what was still open. One Ctrl+C in a terminal delivers SIGINT to this
// process and the CLI wrapper (bin/stellacode.js) forwards SIGTERM as well, so
// repeated signals during shutdown are ignored instead of cutting it short.
const SHUTDOWN_DEADLINE_MS = 5000;
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[StellaCode] Shutting down (${signal})...`);
  setTimeout(() => {
    console.error(`[StellaCode] Still running ${SHUTDOWN_DEADLINE_MS / 1000}s after ${signal}; open: ${process.getActiveResourcesInfo().join(', ')}`);
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS).unref();

  clearInterval(rateLimitSweep);
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  server.close();               // stop accepting connections and upgrades
  broadcaster.close();          // drop open WebSocket clients
  server.closeAllConnections(); // keep-alive HTTP sockets would hold server.close() open
  session.close().then(
    () => { process.exitCode = 0; },
    (err: unknown) => {
      console.error('[StellaCode] Closing the file watcher failed:', err);
      process.exit(1);
    },
  );
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
  console.error('[StellaCode] Unhandled rejection:', reason);
});
