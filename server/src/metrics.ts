/** Build metrics collection and in-memory history (L6 learning loop) */

export interface BuildMetrics {
  /** ISO timestamp of the build */
  timestamp: string;
  /** Total files scanned by the scanner */
  scannedFiles: number;
  /** Files successfully parsed (symbols/imports extracted) */
  parseSuccessCount: number;
  /** Files that failed to parse (read errors) */
  parseFailureCount: number;
  /** Total graph nodes (dirs + files) */
  graphNodes: number;
  /** Total graph edges (import + directory + co-change) */
  graphEdges: number;
  /** Graph build duration in milliseconds */
  buildDurationMs: number;
  /** File count per supported language */
  languageBreakdown: Record<string, number>;
  /** Total symbols extracted across all files */
  totalSymbols: number;
  /** Total directories in the graph */
  totalDirs: number;
}

const MAX_HISTORY = 100;

const history: BuildMetrics[] = [];

export function recordBuildMetrics(metrics: BuildMetrics): void {
  history.push(metrics);
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export function getBuildMetricsHistory(): BuildMetrics[] {
  return history;
}

export function getLatestBuildMetrics(): BuildMetrics | null {
  return history.length > 0 ? history[history.length - 1] : null;
}
