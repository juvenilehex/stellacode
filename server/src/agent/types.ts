// ── Agent Events ──

export interface AgentEvent {
  id: string;
  timestamp: number;
  type: 'file_edit' | 'file_create' | 'file_delete' | 'command' | 'session_start' | 'session_end';
  agent: string;
  filePath?: string;
  description?: string;
}

export interface AgentSession {
  id: string;
  agent: string;
  startTime: number;
  endTime?: number;
  events: AgentEvent[];
  filesModified: string[];
}

// ── Git Analysis ──

/** Conventional Commit types (feat/fix/refactor/docs/chore/...) */
export type ConventionalType =
  | 'feat' | 'fix' | 'refactor' | 'docs' | 'chore'
  | 'test' | 'style' | 'perf' | 'ci' | 'build' | 'revert'
  | 'other';

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  timestamp: number;
  message: string;
  /** Parsed conventional commit type */
  conventionalType: ConventionalType;
  /** Scope from conventional commit, e.g. feat(parser) → "parser" */
  scope?: string;
  /** Clean subject without type prefix */
  subject: string;
  /** Files changed in this commit */
  files: string[];
  /** Is this from an AI agent? */
  isAgent: boolean;
  /** Detected agent name */
  agentName?: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  lastCommitHash: string;
  lastCommitTime: number;
  aheadBehind?: { ahead: number; behind: number };
}

export interface GitCoChange {
  fileA: string;
  fileB: string;
  /** Number of commits where both files changed together */
  frequency: number;
  /** How often they change together vs independently */
  coupling: number;
}

export interface GitStats {
  totalCommits: number;
  recentCommits: GitCommit[];
  branches: GitBranch[];
  /** Files most frequently changed */
  hotFiles: Array<{ path: string; changeCount: number }>;
  /** File pairs that change together (temporal coupling) */
  coChanges: GitCoChange[];
  /** Commit count by conventional type */
  commitsByType: Record<ConventionalType, number>;
  /** Commit count by author */
  commitsByAuthor: Record<string, number>;
  /** Daily commit counts for last 30 days */
  activityHeatmap: Array<{ date: string; count: number }>;
  /** Current branch name */
  currentBranch: string;
  /** Is the working tree clean? */
  isClean: boolean;
}
