export interface NodeMeta {
  symbols?: import('../parser/types.js').ParsedSymbol[];
  imports?: import('../parser/types.js').ParsedImport[];
  /** All exported symbols are unused by other files */
  deadExports?: boolean;
  /** File has no incoming imports and no exports */
  islandFile?: boolean;
  /** Git: last modified timestamp */
  lastModified?: number;
  /** Git: first commit timestamp */
  firstCommit?: number;
  /** Git: total commit count touching this file */
  commitCount?: number;
  /** Agent: primary AI agent that touched this file */
  primaryAgent?: string | null;
  /** Agent: ratio of agent commits to total commits */
  agentRatio?: number;
  /** Agent: last agent to touch this file */
  lastAgent?: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'directory' | 'file' | 'symbol';
  language?: string;
  /** Parent directory id */
  parent?: string;
  /** Number of symbols in file */
  symbolCount: number;
  /** File line count */
  lineCount: number;
  /** File size in bytes */
  size: number;
  /** 3D position after layout */
  x: number;
  y: number;
  z: number;
  /** Connections count (degree) */
  degree: number;
  /** Visual scale factor */
  scale: number;
  /** Metadata for detail panel */
  meta?: NodeMeta;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'import' | 'directory' | 'co-change';
  /** 0-1 strength */
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
