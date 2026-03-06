import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { parseProject } from './parser/index.js';
import { buildGraph } from './graph/builder.js';
import { WsBroadcaster } from './ws.js';
import { createWatcher } from './watcher.js';
import { AgentTracker } from './agent/tracker.js';
import { CONFIG } from './config.js';
import type { GraphData } from './graph/types.js';

const PORT = CONFIG.port;

// Parse --target flag or use env/default
function getTarget(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--target');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  // Also accept bare positional arg (no -- prefix)
  const positional = args.find(a => !a.startsWith('-'));
  if (positional) return positional;
  return process.env.STELLA_TARGET ?? '.';
}

const TARGET = getTarget();
const targetDir = path.resolve(TARGET);

console.log(`[StellaAgent] Target: ${targetDir}`);
console.log(`[StellaAgent] Port: ${PORT}`);

// Agent tracker (init early for co-change data)
const agentTracker = new AgentTracker(targetDir);

// Parse project
let graphData: GraphData;
function rebuildGraph() {
  const start = Date.now();
  const files = parseProject(targetDir);

  // Get co-change data from git history if available
  let coChanges;
  if (agentTracker.isGit) {
    const commits = agentTracker.getGitLog(CONFIG.graphCoChangeLimit);
    coChanges = agentTracker.getCoChanges(commits);
  }

  graphData = buildGraph(files, targetDir, { coChanges });
  console.log(`[StellaAgent] Graph built: ${graphData.stats.totalFiles} files, ${graphData.stats.totalEdges} edges (${Date.now() - start}ms)`);
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

  // Find connected edges and nodes
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

// File watcher with debounced rebuild
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;

const watcher = createWatcher(targetDir, (event) => {
  console.log(`[Watch] ${event.type}: ${event.relativePath}`);

  // Track agent events
  const agentEvent = agentTracker.trackFileChange(
    event.relativePath,
    event.type === 'add' ? 'file_create' : event.type === 'unlink' ? 'file_delete' : 'file_edit'
  );

  // Broadcast file change immediately
  broadcaster.broadcast('file:change', {
    ...event,
    agentEvent,
  });

  // Debounced graph rebuild
  if (rebuildTimeout) clearTimeout(rebuildTimeout);
  rebuildTimeout = setTimeout(() => {
    rebuildGraph();
    broadcaster.broadcast('graph:update', graphData);
  }, CONFIG.watcher.rebuildDelay);
});

// Start
server.listen(PORT, () => {
  console.log(`[StellaAgent] Server running at http://localhost:${PORT}`);
  console.log(`[StellaAgent] WebSocket at ws://localhost:${PORT}/ws`);
  console.log(`[StellaAgent] API: GET /api/graph, /api/stats, /api/agent/events`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  watcher.close();
  broadcaster.close();
  server.close();
});
