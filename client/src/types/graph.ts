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
  meta?: Record<string, unknown>;
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
