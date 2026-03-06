import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from '../config.js';
import type {
  AgentEvent, AgentSession,
  GitCommit, GitBranch, GitCoChange, GitStats, ConventionalType,
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

function git(cmd: string, cwd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8', timeout: CONFIG.git.commandTimeout }).trim();
  } catch {
    return '';
  }
}

function isGitRepo(dir: string): boolean {
  return git('rev-parse --is-inside-work-tree', dir) === 'true';
}

// ── Main Tracker ──

export class AgentTracker {
  private rootDir: string;
  private sessions: AgentSession[] = [];
  private watchEvents: AgentEvent[] = [];
  private eventId = 0;
  readonly isGit: boolean;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.isGit = isGitRepo(this.rootDir);
  }

  // ── Git Log Analysis ──

  /** Parse full git log into structured commits */
  getGitLog(limit = CONFIG.git.defaultLogLimit): GitCommit[] {
    if (!this.isGit) return [];

    const raw = git(
      `log -n ${limit} --format="COMMIT:%H|%h|%an|%ae|%at|%s" --name-only`,
      this.rootDir,
    );
    if (!raw) return [];

    const commits: GitCommit[] = [];
    let current: Omit<GitCommit, 'files'> | null = null;
    let files: string[] = [];

    for (const line of raw.split('\n')) {
      if (line.startsWith('COMMIT:')) {
        // Flush previous
        if (current) commits.push({ ...current, files });

        const parts = line.slice(7).split('|');
        const [hash, shortHash, author, email, atStr, ...msgParts] = parts;
        const message = msgParts.join('|');
        const { type, scope, subject } = parseConventional(message);
        const { isAgent, agentName } = detectAgent(author, message);

        current = {
          hash, shortHash, author, email,
          timestamp: parseInt(atStr) * 1000,
          message, conventionalType: type, scope, subject,
          isAgent, agentName,
        };
        files = [];
      } else if (line.trim() && current) {
        files.push(line.trim());
      }
    }
    if (current) commits.push({ ...current, files });

    return commits;
  }

  // ── Branch Info ──

  getBranches(): GitBranch[] {
    if (!this.isGit) return [];

    const raw = git('branch -a --format="%(refname:short)|%(HEAD)|%(objectname:short)|%(creatordate:unix)"', this.rootDir);
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map(line => {
      const [name, head, hash, time] = line.split('|');
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
    return git('branch --show-current', this.rootDir);
  }

  isWorkingTreeClean(): boolean {
    if (!this.isGit) return true;
    return git('status --porcelain', this.rootDir) === '';
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
          const key = [uniqueFiles[i], uniqueFiles[j]].sort().join('||');
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
        }
      }
    }

    const coChanges: GitCoChange[] = [];
    for (const [key, frequency] of pairCount) {
      if (frequency < minFrequency) continue;
      const [fileA, fileB] = key.split('||');
      const maxIndividual = Math.max(fileCount.get(fileA) ?? 1, fileCount.get(fileB) ?? 1);
      coChanges.push({
        fileA, fileB, frequency,
        coupling: frequency / maxIndividual,
      });
    }

    return coChanges.sort((a, b) => b.coupling - a.coupling).slice(0, CONFIG.git.maxCoChangePairs);
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
