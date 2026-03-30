/** Build metrics collection and in-memory history (L6 learning loop) */

import { CONFIG } from './config.js';

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

/** L6 분석: 메트릭 추세 분석 → 경고/제안 자동 생성 */
export interface MetricsAlert {
  level: 'warning' | 'info';
  metric: string;
  message: string;
  currentValue: number;
  threshold?: number;
}

export interface ConfigAdjustment {
  field: string;
  previousValue: number;
  newValue: number;
  reason: string;
  timestamp: string;
}

const adjustmentLog: ConfigAdjustment[] = [];

/** L6 7→: Get logged config adjustments */
export function getAdjustmentLog(): ConfigAdjustment[] {
  return adjustmentLog;
}

export function analyzeMetrics(): { alerts: MetricsAlert[]; adjustments: ConfigAdjustment[]; summary: Record<string, unknown> } {
  const alerts: MetricsAlert[] = [];

  if (history.length < 2) {
    return {
      alerts: [{ level: 'info', metric: 'history', message: 'Not enough build history for trend analysis (need >= 2 builds)', currentValue: history.length }],
      adjustments: [],
      summary: { totalBuilds: history.length },
    };
  }

  const latest = history[history.length - 1];
  const recent = history.slice(-10);

  // 파싱 실패율 분석
  const totalScanned = latest.scannedFiles;
  const failureRate = totalScanned > 0 ? latest.parseFailureCount / totalScanned : 0;
  if (failureRate > 0.1) {
    alerts.push({
      level: 'warning',
      metric: 'parseFailureRate',
      message: `Parse failure rate ${(failureRate * 100).toFixed(1)}% exceeds 10% threshold (${latest.parseFailureCount}/${totalScanned} files)`,
      currentValue: Math.round(failureRate * 1000) / 10,
      threshold: 10,
    });
  }

  // 빌드 시간 증가 추세 분석
  if (recent.length >= 3) {
    const recentDurations = recent.map(m => m.buildDurationMs);
    const firstHalf = recentDurations.slice(0, Math.floor(recentDurations.length / 2));
    const secondHalf = recentDurations.slice(Math.floor(recentDurations.length / 2));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (avgFirst > 0 && avgSecond > avgFirst * 1.3) {
      alerts.push({
        level: 'warning',
        metric: 'buildDurationTrend',
        message: `Build duration increasing: ${Math.round(avgFirst)}ms → ${Math.round(avgSecond)}ms (+${Math.round(((avgSecond - avgFirst) / avgFirst) * 100)}%). Consider optimizing scan scope.`,
        currentValue: Math.round(avgSecond),
        threshold: Math.round(avgFirst * 1.3),
      });
    }
  }

  // 그래프 복잡도 경고 (노드 대비 엣지 비율)
  if (latest.graphNodes > 0) {
    const edgeRatio = latest.graphEdges / latest.graphNodes;
    if (edgeRatio > 10) {
      alerts.push({
        level: 'warning',
        metric: 'graphComplexity',
        message: `Graph edge/node ratio ${edgeRatio.toFixed(1)} exceeds 10. High coupling detected.`,
        currentValue: Math.round(edgeRatio * 10) / 10,
        threshold: 10,
      });
    }
  }

  // 심볼 수 대비 파일 수 — 파일당 심볼이 너무 많으면 파일 분할 제안
  const filesWithSymbols = latest.parseSuccessCount;
  if (filesWithSymbols > 0) {
    const symbolsPerFile = latest.totalSymbols / filesWithSymbols;
    if (symbolsPerFile > 50) {
      alerts.push({
        level: 'info',
        metric: 'symbolDensity',
        message: `Average ${symbolsPerFile.toFixed(0)} symbols/file. Consider splitting large files for maintainability.`,
        currentValue: Math.round(symbolsPerFile),
        threshold: 50,
      });
    }
  }

  // ── L6 7→: Auto-adjust CONFIG based on alerts ──
  const newAdjustments: ConfigAdjustment[] = [];

  // High parse failure rate → reduce rebuild delay to skip problematic files faster
  // (interpreted as: large/complex files cause failures, so increase debounce to
  //  batch changes and reduce wasted rebuilds)
  const parseFailureAlert = alerts.find(a => a.metric === 'parseFailureRate');
  if (parseFailureAlert) {
    const prevDelay = CONFIG.watcher.rebuildDelay;
    const newDelay = Math.min(prevDelay + 200, 2000);
    if (newDelay !== prevDelay) {
      CONFIG.watcher.rebuildDelay = newDelay;
      const adj: ConfigAdjustment = {
        field: 'watcher.rebuildDelay',
        previousValue: prevDelay,
        newValue: newDelay,
        reason: `Parse failure rate ${parseFailureAlert.currentValue}% > 10% — increasing debounce to reduce wasted rebuilds`,
        timestamp: new Date().toISOString(),
      };
      newAdjustments.push(adj);
      adjustmentLog.push(adj);
      console.log(`[L6:AutoAdjust] watcher.rebuildDelay: ${prevDelay}ms → ${newDelay}ms (high parse failure rate)`);
    }
  }

  // Build duration increasing → increase debounce interval
  const durationAlert = alerts.find(a => a.metric === 'buildDurationTrend');
  if (durationAlert) {
    const prevDelay = CONFIG.watcher.rebuildDelay;
    const newDelay = Math.min(prevDelay + 300, 3000);
    if (newDelay !== prevDelay) {
      CONFIG.watcher.rebuildDelay = newDelay;
      const adj: ConfigAdjustment = {
        field: 'watcher.rebuildDelay',
        previousValue: prevDelay,
        newValue: newDelay,
        reason: `Build duration trending up (${durationAlert.currentValue}ms) — increasing debounce to reduce rebuild frequency`,
        timestamp: new Date().toISOString(),
      };
      newAdjustments.push(adj);
      adjustmentLog.push(adj);
      console.log(`[L6:AutoAdjust] watcher.rebuildDelay: ${prevDelay}ms → ${newDelay}ms (build duration trend)`);
    }
  }

  // Cap adjustment log to prevent unbounded growth
  if (adjustmentLog.length > 50) {
    adjustmentLog.splice(0, adjustmentLog.length - 50);
  }

  return {
    alerts,
    adjustments: newAdjustments,
    summary: {
      totalBuilds: history.length,
      latestBuildMs: latest.buildDurationMs,
      parseFailureRate: Math.round(failureRate * 1000) / 10,
      graphNodes: latest.graphNodes,
      graphEdges: latest.graphEdges,
      totalSymbols: latest.totalSymbols,
      scannedFiles: latest.scannedFiles,
      currentRebuildDelay: CONFIG.watcher.rebuildDelay,
    },
  };
}
