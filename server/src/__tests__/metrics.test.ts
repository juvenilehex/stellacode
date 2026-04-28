import { describe, it, expect, beforeEach } from 'vitest';
import { recordBuildMetrics, getBuildMetricsHistory, getLatestBuildMetrics, analyzeMetrics, getAdjustmentLog, type BuildMetrics } from '../metrics.js';

function makeDummyMetrics(overrides: Partial<BuildMetrics> = {}): BuildMetrics {
  return {
    timestamp: new Date().toISOString(),
    scannedFiles: 50,
    parseSuccessCount: 48,
    parseFailureCount: 2,
    graphNodes: 100,
    graphEdges: 200,
    buildDurationMs: 500,
    languageBreakdown: { typescript: 30, javascript: 20 },
    totalSymbols: 300,
    totalDirs: 10,
    ...overrides,
  };
}

describe('metrics', () => {
  // Note: history is module-level, so tests may accumulate state

  describe('recordBuildMetrics + getLatestBuildMetrics', () => {
    it('records and retrieves metrics', () => {
      const m = makeDummyMetrics({ scannedFiles: 77 });
      recordBuildMetrics(m);
      const latest = getLatestBuildMetrics();
      expect(latest).not.toBeNull();
      expect(latest!.scannedFiles).toBe(77);
    });

    it('getBuildMetricsHistory returns array', () => {
      const h = getBuildMetricsHistory();
      expect(Array.isArray(h)).toBe(true);
      expect(h.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeMetrics', () => {
    it('returns alerts and summary', () => {
      // Ensure at least 2 entries in history
      recordBuildMetrics(makeDummyMetrics());
      recordBuildMetrics(makeDummyMetrics());
      const result = analyzeMetrics();
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('adjustments');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.alerts)).toBe(true);
    });

    it('detects high parse failure rate', () => {
      // Add metrics with high failure rate
      recordBuildMetrics(makeDummyMetrics({
        scannedFiles: 100,
        parseSuccessCount: 80,
        parseFailureCount: 20, // 20% failure rate
      }));
      const result = analyzeMetrics();
      const parseAlert = result.alerts.find(a => a.metric === 'parseFailureRate');
      expect(parseAlert).toBeDefined();
      expect(parseAlert!.level).toBe('warning');
    });

    it('summary includes key fields', () => {
      recordBuildMetrics(makeDummyMetrics());
      const result = analyzeMetrics();
      expect(result.summary).toHaveProperty('totalBuilds');
      expect(result.summary).toHaveProperty('scannedFiles');
    });
  });

  describe('getAdjustmentLog', () => {
    it('returns array', () => {
      const log = getAdjustmentLog();
      expect(Array.isArray(log)).toBe(true);
    });
  });
});
