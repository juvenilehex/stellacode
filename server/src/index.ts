import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseProject } from './parser/index.js';
import { buildGraph } from './graph/builder.js';
import { WsBroadcaster } from './ws.js';
import { createWatcher } from './watcher.js';
import { AgentTracker } from './agent/tracker.js';
import { LiveAgentWatcher } from './agent/live-watcher.js';
import { CONFIG } from './config.js';
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
  const files = parseProject(targetDir);

  let coChanges;
  let fileGitMeta;
  if (agentTracker.isGit) {
    const commits = agentTracker.getGitLog(CONFIG.graphCoChangeLimit);
    coChanges = agentTracker.getCoChanges(commits);
    fileGitMeta = agentTracker.getFileGitMeta(commits);
  }

  graphData = buildGraph(files, targetDir, { coChanges, fileGitMeta });
  console.log(`[StellaCode] Graph built: ${graphData.stats.totalFiles} files, ${graphData.stats.totalEdges} edges (${Date.now() - start}ms)`);
}

rebuildGraph();

// Express app
const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.get('/api/graph', (_req, res) => {
  res.json(graphData);
});

app.get('/api/graph/node/:id', (req, res) => {
  const nodeId = decodeURIComponent(req.params.id);
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

  const resolved = path.resolve(newTarget);

  try {
    if (!fs.statSync(resolved).isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
  } catch {
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
  const limit = Math.min(parseInt(req.query.limit as string) || 50, CONFIG.git.maxApiLogLimit);
  res.json(agentTracker.getGitLog(limit));
});

app.get('/api/git/branches', (_req, res) => {
  res.json(agentTracker.getBranches());
});

app.get('/api/git/co-changes', (_req, res) => {
  const commits = agentTracker.getGitLog(CONFIG.git.coChangeLogLimit);
  res.json(agentTracker.getCoChanges(commits));
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

// Start
server.listen(PORT, () => {
  console.log(`[StellaCode] Server running at http://localhost:${PORT}`);
  console.log(`[StellaCode] WebSocket at ws://localhost:${PORT}/ws`);
  console.log(`[StellaCode] API: GET /api/graph, /api/stats, /api/target`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  activeWatcher.close();
  liveWatcher.close();
  broadcaster.close();
  server.close();
});
