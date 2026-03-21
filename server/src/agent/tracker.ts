import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../config.js';
import type {
  AgentEvent, AgentSession,
  GitCommit, GitBranch, GitCoChange, GitStats, ConventionalType, TimelineCommit,
} from './types.js';

// ── Conventional Commit parser ──

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/;
const VALID_TYPES = new Set<ConventionalType>([
  'feat', 'fix', 'refactor', 'docs', 'chore',
  'test', 'style', 'perf', 'ci', 'build', 'revert',
]);

function parseConventional(message: string): { type: ConventionalType; scope?: string; subject: string } {
  const match = message.match(CONVENTIONAL_RE);
  if (match) {
    const rawType = match[1].toLowerCase();
    return {
      type: VALID_TYPES.has(rawType as ConventionalType) ? rawType as ConventionalType : 'other',
      scope: match[2] || undefined,
      subject: match[3],
    };
  }
  return { type: 'other', subject: message };
}

// ── Agent detection ──

const AGENT_PATTERNS = [
  { pattern: /claude/i, name: 'claude-code' },
  { pattern: /copilot/i, name: 'copilot' },
  { pattern: /cursor/i, name: 'cursor' },
  { pattern: /aider/i, name: 'aider' },
  { pattern: /codeium/i, name: 'codeium' },
  { pattern: /tabnine/i, name: 'tabnine' },
  { pattern: /windsurf|cascade/i, name: 'windsurf' },
  { pattern: /devin-ai|devin/i, name: 'devin' },
  { pattern: /amazon\s*q|aws-q/i, name: 'amazon-q' },
  { pattern: /gemini/i, name: 'gemini' },
  { pattern: /\bbolt\b|stackblitz/i, name: 'bolt' },
];

function detectAgent(author: string, message: string): { isAgent: boolean; agentName?: string } {
  // Check author name
  for (const { pattern, name } of AGENT_PATTERNS) {
    if (pattern.test(author)) return { isAgent: true, agentName: name };
  }
  // Check Co-Authored-By in message
  if (message.includes('Co-Authored-By')) {
    for (const { pattern, name } of AGENT_PATTERNS) {
      if (pattern.test(message)) return { isAgent: true, agentName: name };
    }
  }
  return { isAgent: false };
}

// ── Git command helpers ──

function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: CONFIG.git.commandTimeout,
      windowsHide: true,
    }).trim();
  } catch {
    return '';
  }
}

function isGitRepo(dir: string): boolean {
  return git(['rev-parse', '--is-inside-work-tree'], dir) === 'true';
}

// ── Main Tracker ──

/** Maximum watch events kept in memory */
const MAX_WATCH_EVENTS = 500;

export class AgentTracker {
  private rootDir: string;
  private sessions: AgentSession[] = [];
  private watchEvents: AgentEvent[] = [];
  private eventId = 0;
  private _isGit: boolean;
  get isGit(): boolean { return this._isGit; }

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this._isGit = isGitRepo(this.rootDir);
  }

  updateTarget(newRoot: string) {
    this.rootDir = path.resolve(newRoot);
    this._isGit = isGitRepo(this.rootDir);
    this.watchEvents = [];
    this.sessions = [];
    this.eventId = 0;
  }

  // ── Git Log Analysis ──

  /** Parse full git log into structured commits with file status */
  getGitLog(limit = CONFIG.git.defaultLogLimit): GitCommit[] {
    if (!this.isGit) return [];

    // Use record separator (0x1e) as delimiter — safe against any field content
    const SEP = String.fromCharCode(0x1e);
    const raw = git(
      ['log', `-n`, `${limit}`, `--format=COMMIT:%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%at${SEP}%s`, '--name-status'],
      this.rootDir,
    );
    if (!raw) return [];

    const commits: GitCommit[] = [];
    let current: Omit<GitCommit, 'files' | 'fileStatuses'> | null = null;
    let files: string[] = [];
    let fileStatuses: Array<{ status: 'A' | 'M' | 'D' | 'R'; path: string; oldPath?: string }> = [];

    for (const line of raw.split('\n')) {
      if (line.startsWith('COMMIT:')) {
        // Flush previous
        if (current) commits.push({ ...current, files, fileStatuses });

        const parts = line.slice(7).split(SEP);
        const [hash, shortHash, author, email, atStr, ...msgParts] = parts;
        const message = msgParts.join(SEP);
        const { type, scope, subject } = parseConventional(message);
        const { isAgent, agentName } = detectAgent(author, message);

        current = {
          hash, shortHash, author, email,
          timestamp: parseInt(atStr) * 1000,
          message, conventionalType: type, scope, subject,
          isAgent, agentName,
        };
        files = [];
        fileStatuses = [];
      } else if (line.trim() && current) {
        // Parse --name-status format: "M\tfile.ts" or "R100\told.ts\tnew.ts"
        const parts = line.split('\t');
        const statusCode = parts[0].trim();
        if (statusCode && parts.length >= 2) {
          const status = statusCode[0] as 'A' | 'M' | 'D' | 'R';
          if (status === 'R' && parts.length >= 3) {
            files.push(parts[2]); // new path
            fileStatuses.push({ status, path: parts[2], oldPath: parts[1] });
          } else {
            files.push(parts[1]);
            fileStatuses.push({ status, path: parts[1] });
          }
        }
      }
    }
    if (current) commits.push({ ...current, files, fileStatuses });

    return commits;
  }

  /** Get timeline data for time travel replay (oldest first) */
  getTimeline(limit = CONFIG.git.statsLogLimit): TimelineCommit[] {
    const commits = this.getGitLog(limit);
    return commits
      .map(c => ({
        hash: c.hash,
        shortHash: c.shortHash,
        timestamp: c.timestamp,
        message: c.message,
        author: c.author,
        isAgent: c.isAgent,
        agentName: c.agentName,
        conventionalType: c.conventionalType,
        fileStatuses: c.fileStatuses ?? c.files.map(f => ({ status: 'M' as const, path: f })),
      }))
      .reverse(); // oldest first
  }

  // ── Branch Info ──

  getBranches(): GitBranch[] {
    if (!this.isGit) return [];

    const raw = git(['branch', '-a', '--format=%(refname:short)\t%(HEAD)\t%(objectname:short)\t%(creatordate:unix)'], this.rootDir);
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map(line => {
      const [name, head, hash, time] = line.split('\t');
      return {
        name,
        isCurrent: head === '*',
        lastCommitHash: hash,
        lastCommitTime: parseInt(time) * 1000,
      };
    });
  }

  getCurrentBranch(): string {
    if (!this.isGit) return '';
    return git(['branch', '--show-current'], this.rootDir);
  }

  isWorkingTreeClean(): boolean {
    if (!this.isGit) return true;
    return git(['status', '--porcelain'], this.rootDir) === '';
  }

  // ── Co-Change Analysis (temporal coupling) ──

  /** Find file pairs that frequently change together */
  getCoChanges(commits: GitCommit[], minFrequency = CONFIG.git.minCoChangeFrequency): GitCoChange[] {
    const pairCount = new Map<string, number>();
    const fileCount = new Map<string, number>();

    for (const commit of commits) {
      const uniqueFiles = [...new Set(commit.files)];

      // Count individual file changes
      for (const f of uniqueFiles) {
        fileCount.set(f, (fileCount.get(f) ?? 0) + 1);
      }

      // Count co-occurrences
      for (let i = 0; i < uniqueFiles.length; i++) {
        for (let j = i + 1; j < uniqueFiles.length; j++) {
          const key = [uniqueFiles[i], uniqueFiles[j]].sort().join('\0');
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
        }
      }
    }

    const coChanges: GitCoChange[] = [];
    for (const [key, frequency] of pairCount) {
      if (frequency < minFrequency) continue;
      const parts = key.split('\0');
      if (parts.length < 2) continue;
      const [fileA, fileB] = parts;
      const maxIndividual = Math.max(fileCount.get(fileA) ?? 1, fileCount.get(fileB) ?? 1);
      coChanges.push({
        fileA, fileB, frequency,
        coupling: frequency / maxIndividual,
      });
    }

    return coChanges.sort((a, b) => b.coupling - a.coupling).slice(0, CONFIG.git.maxCoChangePairs);
  }

  // ── Per-file Git Metadata ──

  /** Compute per-file last modified time, first commit time, and commit count from git log */
  getFileGitMeta(commits?: GitCommit[]): Map<string, { lastModified: number; firstCommit: number; commitCount: number }> {
    const result = new Map<string, { lastModified: number; firstCommit: number; commitCount: number }>();
    if (!this.isGit) return result;

    const data = commits ?? this.getGitLog(CONFIG.git.statsLogLimit);

    for (const commit of data) {
      for (const file of commit.files) {
        const existing = result.get(file);
        if (existing) {
          existing.commitCount++;
          if (commit.timestamp > existing.lastModified) {
            existing.lastModified = commit.timestamp;
          }
          if (commit.timestamp < existing.firstCommit) {
            existing.firstCommit = commit.timestamp;
          }
        } else {
          result.set(file, { lastModified: commit.timestamp, firstCommit: commit.timestamp, commitCount: 1 });
        }
      }
    }

    return result;
  }

  // ── Per-file Agent Authorship ──

  /** For each file, compute which agents touched it and how much */
  getFileAgentMeta(commits?: GitCommit[]): Map<string, { primaryAgent: string | null; agentRatio: number; lastAgent: string | null }> {
    const result = new Map<string, { agents: Map<string, number>; total: number; lastAgent: string | null }>();
    if (!this.isGit) return new Map();

    const data = commits ?? this.getGitLog(CONFIG.git.statsLogLimit);

    for (const commit of data) {
      for (const file of commit.files) {
        let entry = result.get(file);
        if (!entry) {
          entry = { agents: new Map(), total: 0, lastAgent: null };
          result.set(file, entry);
        }
        entry.total++;
        if (commit.isAgent && commit.agentName) {
          entry.agents.set(commit.agentName, (entry.agents.get(commit.agentName) ?? 0) + 1);
          if (!entry.lastAgent) entry.lastAgent = commit.agentName; // commits are newest-first
        }
      }
    }

    const output = new Map<string, { primaryAgent: string | null; agentRatio: number; lastAgent: string | null }>();
    for (const [file, entry] of result) {
      let primaryAgent: string | null = null;
      let maxCount = 0;
      let totalAgentCommits = 0;
      for (const [agent, count] of entry.agents) {
        totalAgentCommits += count;
        if (count > maxCount) { maxCount = count; primaryAgent = agent; }
      }
      output.set(file, {
        primaryAgent,
        agentRatio: entry.total > 0 ? totalAgentCommits / entry.total : 0,
        lastAgent: entry.lastAgent,
      });
    }

    return output;
  }

  // ── Aggregate Stats ──

  getGitStats(): GitStats {
    const commits = this.getGitLog(CONFIG.git.statsLogLimit);
    const branches = this.getBranches();
    const coChanges = this.getCoChanges(commits);

    // Commits by type
    const commitsByType = {} as Record<ConventionalType, number>;
    for (const c of commits) {
      commitsByType[c.conventionalType] = (commitsByType[c.conventionalType] ?? 0) + 1;
    }

    // Commits by author
    const commitsByAuthor: Record<string, number> = {};
    for (const c of commits) {
      commitsByAuthor[c.author] = (commitsByAuthor[c.author] ?? 0) + 1;
    }

    // Hot files (most changed)
    const fileCounts = new Map<string, number>();
    for (const c of commits) {
      for (const f of c.files) {
        fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
      }
    }
    const hotFiles = [...fileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, CONFIG.git.hotFilesLimit)
      .map(([p, changeCount]) => ({ path: p, changeCount }));

    // Activity heatmap (last 30 days)
    const now = Date.now();
    const thirtyDaysAgo = now - CONFIG.git.heatmapDays * 24 * 60 * 60 * 1000;
    const dayCounts = new Map<string, number>();
    for (const c of commits) {
      if (c.timestamp < thirtyDaysAgo) continue;
      const date = new Date(c.timestamp).toISOString().slice(0, 10);
      dayCounts.set(date, (dayCounts.get(date) ?? 0) + 1);
    }
    const activityHeatmap = [...dayCounts.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalCommits: commits.length,
      recentCommits: commits.slice(0, CONFIG.git.recentCommitsLimit),
      branches,
      hotFiles,
      coChanges,
      commitsByType,
      commitsByAuthor,
      activityHeatmap,
      currentBranch: this.getCurrentBranch(),
      isClean: this.isWorkingTreeClean(),
    };
  }

  // ── Agent Events (legacy + watch) ──

  getRecentGitEvents(limit = 50): AgentEvent[] {
    const commits = this.getGitLog(limit);
    return commits
      .filter(c => c.isAgent)
      .flatMap(c => c.files.map(f => ({
        id: `git-${this.eventId++}`,
        timestamp: c.timestamp,
        type: 'file_edit' as const,
        agent: c.agentName ?? c.author,
        filePath: f,
        description: c.message,
      })));
  }

  detectClaudeSession(): AgentSession | null {
    const claudeDir = path.join(this.rootDir, '.claude');
    if (!fs.existsSync(claudeDir)) return null;
    try {
      const stat = fs.statSync(claudeDir);
      return {
        id: `claude-${Date.now()}`,
        agent: 'claude-code',
        startTime: stat.mtimeMs,
        events: [],
        filesModified: [],
      };
    } catch {
      return null;
    }
  }

  trackFileChange(filePath: string, changeType: 'file_edit' | 'file_create' | 'file_delete'): AgentEvent {
    const event: AgentEvent = {
      id: `watch-${this.eventId++}`,
      timestamp: Date.now(),
      type: changeType,
      agent: 'unknown',
      filePath,
    };
    this.watchEvents.push(event);
    // Evict oldest events when exceeding memory bound
    if (this.watchEvents.length > MAX_WATCH_EVENTS) {
      this.watchEvents = this.watchEvents.slice(-MAX_WATCH_EVENTS);
    }
    return event;
  }

  getEvents(): AgentEvent[] {
    return [...this.watchEvents, ...this.getRecentGitEvents()];
  }

  getSessions(): AgentSession[] {
    const claude = this.detectClaudeSession();
    return claude ? [claude, ...this.sessions] : [...this.sessions];
  }
}
