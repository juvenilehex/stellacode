import { parseProject, clearParseCache } from './parser/index.js';
import { buildGraph } from './graph/builder.js';
import { createWatcher, type FileChangeEvent } from './watcher.js';
import { AgentTracker } from './agent/tracker.js';
import { LiveAgentWatcher } from './agent/live-watcher.js';
import { CONFIG } from './config.js';
import { recordBuildMetrics, analyzeMetrics } from './metrics.js';
import { verifyGraphIntegrity, type IntegrityResult } from './routes/quality.js';
import type { GraphData } from './graph/types.js';

interface CandidateBuild {
  graph: GraphData;
  integrity: IntegrityResult;
  parseSuccessCount: number;
  parseFailureCount: number;
  scannedCount: number;
  buildDurationMs: number;
}

export interface TargetSessionEvents {
  /** A watched source file changed (debouncing and broadcasting stay with the caller) */
  onFileChange: (event: FileChangeEvent) => void;
  /** A live agent event from the agent's own session log */
  onLiveEvent: ConstructorParameters<typeof LiveAgentWatcher>[1];
  /** A build of the current target was recorded — its integrity is the latest build status */
  onBuildRecorded: (integrity: IntegrityResult) => void;
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
 * The directory the server observes and everything that follows from it: the published
 * graph, its parse counts, the latest build's integrity, the file and live-agent watchers
 * and the agent tracker. Building, rebuilding and switching to another directory happen
 * only here, so a test can run the real procedure on a temporary directory; the HTTP
 * server, debouncing and broadcasting stay in index.ts.
 */
export class TargetSession {
  readonly agentTracker: AgentTracker;
  private targetDir: string;
  private graphData!: GraphData;
  private parseSuccessCount = 0;
  private parseFailureCount = 0;
  private lastIntegrity!: IntegrityResult;
  private activeWatcher: ReturnType<typeof createWatcher>;
  private liveWatcher: LiveAgentWatcher;

  constructor(dir: string, private readonly events: TargetSessionEvents) {
    this.targetDir = dir;
    this.agentTracker = new AgentTracker(dir);
    this.rebuild();
    this.liveWatcher = new LiveAgentWatcher(dir, events.onLiveEvent);
    this.activeWatcher = createWatcher(dir, events.onFileChange);
  }

  getTargetDir(): string { return this.targetDir; }
  getGraphData(): GraphData { return this.graphData; }
  getParseSuccessCount(): number { return this.parseSuccessCount; }
  getParseFailureCount(): number { return this.parseFailureCount; }
  /** Integrity of the latest recorded build of the current target (the constructor builds one) */
  getLastIntegrity(): IntegrityResult { return this.lastIntegrity; }

  /**
   * Record a build of the current target as its L3 result and L6 metrics. A directory
   * refused by switchTarget never becomes the target, so it is not recorded here —
   * /api/integrity, the build status and the metrics keep describing the project on screen.
   */
  private recordTargetBuild(build: CandidateBuild) {
    this.lastIntegrity = build.integrity;
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

  private commitBuild(build: CandidateBuild) {
    this.graphData = build.graph;
    this.parseSuccessCount = build.parseSuccessCount;
    this.parseFailureCount = build.parseFailureCount;
  }

  /**
   * Rebuild the current target (startup and file changes). A build that fails the
   * integrity check keeps the previous graph of the same project — a half-saved file
   * should not blank the view — and is still recorded, so the failure is reported.
   * With no previous graph the candidate is all there is. Returns whether the graph changed.
   */
  rebuild(): boolean {
    const build = buildCandidate(this.targetDir, this.agentTracker);
    this.recordTargetBuild(build);
    let committed = false;
    if (build.integrity.valid || !this.graphData) {
      if (!build.integrity.valid) console.warn('[L3:IntegrityCheck] No previous graph — using candidate despite errors');
      this.commitBuild(build);
      committed = true;
    } else {
      console.warn('[L3:IntegrityCheck] Retaining previous valid graph');
    }
    // Announced once the session is consistent, so a listener reading it sees this build's outcome.
    this.events.onBuildRecorded(build.integrity);
    return committed;
  }

  /**
   * Point the session at another directory. The candidate graph is built first and the
   * switch happens only if it passes the integrity check — a rejected directory leaves
   * the target, watchers, agent history and published graph exactly as they were.
   * (Undoing a switch afterwards would not: agentTracker.updateTarget clears its events.)
   */
  switchTarget(dir: string): IntegrityResult {
    // The parse cache is keyed by relative path, so another root must not read it.
    clearParseCache();
    const build = buildCandidate(dir, new AgentTracker(dir));
    if (!build.integrity.valid) {
      clearParseCache();
      console.warn(`[StellaCode] Target rejected, staying on ${this.targetDir}`);
      return build.integrity;
    }

    this.activeWatcher.close();
    this.targetDir = dir;
    this.activeWatcher = createWatcher(dir, this.events.onFileChange);
    this.liveWatcher.updateTarget(dir);
    this.agentTracker.updateTarget(dir);
    this.recordTargetBuild(build);
    this.commitBuild(build);
    this.events.onBuildRecorded(build.integrity);
    console.log(`[StellaCode] Target changed: ${dir}`);
    return build.integrity;
  }

  close(): Promise<void> {
    this.liveWatcher.close();
    return this.activeWatcher.close();
  }
}
