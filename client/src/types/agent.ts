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
  conventionalType: ConventionalType;
  scope?: string;
  subject: string;
  files: string[];
  isAgent: boolean;
  agentName?: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  lastCommitHash: string;
  lastCommitTime: number;
  aheadBehind?: { ahead: number; behind: number };
}

/** A commit that changed both files of a pair — server CoChangeCommit (R675) */
export interface CoChangeCommit {
  shortHash: string;
  message: string;
  timestamp: number;
  /** Files the commit changed (inside the opened folder when it is a subfolder) */
  files: number;
}

export interface GitCoChange {
  fileA: string;
  fileB: string;
  frequency: number;
  coupling: number;
  /** Newest commits that changed both (at most server CONFIG.git.coChangeEvidenceCommits) */
  shared: CoChangeCommit[];
  /** How many of all `frequency` shared commits changed more than server CONFIG.git.largeChangesetFiles files */
  largeShared: number;
}

export interface GitStats {
  totalCommits: number;
  recentCommits: GitCommit[];
  branches: GitBranch[];
  hotFiles: Array<{ path: string; changeCount: number }>;
  /** The strongest pairs (server cut: CONFIG.git.maxCoChangePairs) */
  coChanges: GitCoChange[];
  /** Every pair that changed together often enough, before that cut */
  coChangeTotal: number;
  /** A shared commit changing more files than this counts in largeShared (server CONFIG.git.largeChangesetFiles) */
  largeChangesetFiles: number;
  commitsByType: Record<ConventionalType, number>;
  commitsByAuthor: Record<string, number>;
  activityHeatmap: Array<{ date: string; count: number }>;
  currentBranch: string;
  isClean: boolean;
}
