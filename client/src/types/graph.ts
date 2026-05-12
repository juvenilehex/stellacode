/** Structured metadata attached to graph nodes by the server */
export interface NodeMeta {
  /** Unix timestamp of first commit touching this file */
  firstCommit?: number;
  /** Unix timestamp of most recent commit touching this file */
  lastCommit?: number;
  /** Total number of commits touching this file */
  commitCount?: number;
  /** Primary AI agent that modified this file (e.g. 'claude-code') */
  primaryAgent?: string;
  /** Ratio of agent-authored commits (0-1) */
  agentRatio?: number;
  /** Whether this file is an island (no imports/exports) */
  islandFile?: boolean;
  /** Whether this file has dead (unused) exports */
  deadExports?: boolean;
  /** Allow future server-side extensions */
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'directory' | 'file' | 'symbol';
  language?: string;
  parent?: string;
  symbolCount: number;
  lineCount: number;
  size: number;
  x: number;
  y: number;
  z: number;
  degree: number;
  scale: number;
  meta?: NodeMeta;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'import' | 'directory' | 'co-change';
  strength: number;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootDir: string;
  timestamp: number;
  stats: {
    totalFiles: number;
    totalDirs: number;
    totalSymbols: number;
    totalEdges: number;
    languages: Record<string, number>;
  };
}
