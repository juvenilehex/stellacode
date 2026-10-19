// ── Agent Events ──

export interface AgentEvent {
  id: string;
  timestamp: number;
  type: 'file_read' | 'file_edit' | 'file_create' | 'file_delete' | 'command' | 'session_start' | 'session_end';
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
  /** File status from --name-status (A=add, D=delete, M=modify, R=rename) */
  fileStatuses?: Array<{ status: 'A' | 'M' | 'D' | 'R'; path: string; oldPath?: string }>;
}

/** Lightweight timeline commit for time travel replay */
export interface TimelineCommit {
  hash: string;
  shortHash: string;
  timestamp: number;
  message: string;
  author: string;
  isAgent: boolean;
  agentName?: string;
  conventionalType: ConventionalType;
  fileStatuses: Array<{ status: 'A' | 'M' | 'D' | 'R'; path: string; oldPath?: string }>;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  lastCommitHash: string;
  lastCommitTime: number;
  aheadBehind?: { ahead: number; behind: number };
}

/** One commit that changed both files of a co-change pair — the clue for why they move together (R675) */
export interface CoChangeCommit {
  shortHash: string;
  /** Commit subject line */
  message: string;
  timestamp: number;
  /** Files the commit changed (inside the opened folder when it is a subfolder) */
  files: number;
}

export interface GitCoChange {
  fileA: string;
  fileB: string;
  /** Number of commits where both files changed together */
  frequency: number;
  /** How often they change together vs independently */
  coupling: number;
  /** Newest commits that changed both, at most CONFIG.git.coChangeEvidenceCommits */
  shared: CoChangeCommit[];
  /** How many of the `frequency` shared commits changed more than CONFIG.git.largeChangesetFiles files */
  largeShared: number;
}

export interface GitStats {
  totalCommits: number;
  recentCommits: GitCommit[];
  branches: GitBranch[];
  /** Files most frequently changed */
  hotFiles: Array<{ path: string; changeCount: number }>;
  /** File pairs that change together (temporal coupling) — the strongest CONFIG.git.maxCoChangePairs */
  coChanges: GitCoChange[];
  /** Every pair that changed together at least minCoChangeFrequency times, before the cut to coChanges */
  coChangeTotal: number;
  /** The 'large commit' line used for largeShared — sent so the client never keeps its own copy */
  largeChangesetFiles: number;
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
