/** Usage statistics tracker (L2 quality loop — in-app feedback collection) */

import fs from 'node:fs';
import path from 'node:path';

export interface SessionRecord {
  /** Session ID (incrementing) */
  id: number;
  /** ISO timestamp of WebSocket connect */
  connectedAt: string;
  /** ISO timestamp of WebSocket disconnect (null if still active) */
  disconnectedAt: string | null;
  /** Duration in milliseconds (null if still active) */
  durationMs: number | null;
  /** Features accessed during this session */
  featuresAccessed: Set<string>;
}

export interface UsageSummary {
  totalSessions: number;
  activeSessions: number;
  averageDurationMs: number | null;
  featureUsage: Record<string, number>;
  recentSessions: Array<{
    id: number;
    connectedAt: string;
    disconnectedAt: string | null;
    durationMs: number | null;
    featuresAccessed: string[];
  }>;
}

/** Quick-exit threshold: sessions shorter than this are flagged */
const QUICK_EXIT_THRESHOLD_MS = 10_000;

export interface UsageInsight {
  type: 'top-features' | 'quick-exit-rate' | 'feature-trend';
  message: string;
  data: Record<string, unknown>;
}

export interface UsageInsights {
  topFeatures: string[];
  quickExitRate: number;
  quickExitCount: number;
  totalCompletedSessions: number;
  insights: UsageInsight[];
}

/** Known feature categories derived from API / WS message patterns */
const FEATURE_FROM_PATH: Record<string, string> = {
  '/api/graph': 'graph',
  '/api/stats': 'graph',
  '/api/relayout': 'graph',
  '/api/agent/events': 'agent',
  '/api/agent/sessions': 'agent',
  '/api/timeline': 'timeline',
  '/api/git/stats': 'git',
  '/api/git/log': 'git',
  '/api/git/branches': 'git',
  '/api/git/co-changes': 'git',
  '/api/metrics': 'metrics',
  '/api/target': 'target',
};

const MAX_SESSIONS = 200;

export class UsageTracker {
  private sessions: Map<number, SessionRecord> = new Map();
  private nextId = 1;

  /** Called when a WebSocket client connects. Returns session ID. */
  onConnect(): number {
    const id = this.nextId++;
    const record: SessionRecord = {
      id,
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
      durationMs: null,
      featuresAccessed: new Set(),
    };
    this.sessions.set(id, record);

    // Evict oldest completed sessions if over limit
    if (this.sessions.size > MAX_SESSIONS) {
      for (const [key, sess] of this.sessions) {
        if (sess.disconnectedAt !== null) {
          this.sessions.delete(key);
          break;
        }
      }
    }

    return id;
  }

  /** Called when a WebSocket client disconnects */
  onDisconnect(sessionId: number): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    const now = new Date();
    record.disconnectedAt = now.toISOString();
    record.durationMs = now.getTime() - new Date(record.connectedAt).getTime();
  }

  /** Record a feature access from an API request path */
  recordFeatureAccess(sessionId: number, requestPath: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    const feature = FEATURE_FROM_PATH[requestPath];
    if (feature) {
      record.featuresAccessed.add(feature);
    }
  }

  /** Record a feature access by name */
  recordFeature(sessionId: number, feature: string): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    record.featuresAccessed.add(feature);
  }

  /** Get usage summary for the /api/feedback/usage endpoint */
  getSummary(limit = 20): UsageSummary {
    const all = Array.from(this.sessions.values());
    const completed = all.filter(s => s.disconnectedAt !== null);
    const active = all.filter(s => s.disconnectedAt === null);

    // Average duration of completed sessions
    let averageDurationMs: number | null = null;
    if (completed.length > 0) {
      const total = completed.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
      averageDurationMs = Math.round(total / completed.length);
    }

    // Feature usage counts across all sessions
    const featureUsage: Record<string, number> = {};
    for (const session of all) {
      for (const feature of session.featuresAccessed) {
        featureUsage[feature] = (featureUsage[feature] ?? 0) + 1;
      }
    }

    // Recent sessions (most recent first)
    const recent = all
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map(s => ({
        id: s.id,
        connectedAt: s.connectedAt,
        disconnectedAt: s.disconnectedAt,
        durationMs: s.durationMs,
        featuresAccessed: Array.from(s.featuresAccessed),
      }));

    return {
      totalSessions: all.length,
      activeSessions: active.length,
      averageDurationMs,
      featureUsage,
      recentSessions: recent,
    };
  }

  /** L2 7→: Derive actionable insights from usage data */
  getInsights(): UsageInsights {
    const all = Array.from(this.sessions.values());
    const completed = all.filter(s => s.disconnectedAt !== null);

    // Top features by usage count
    const featureCounts: Record<string, number> = {};
    for (const session of all) {
      for (const feature of session.featuresAccessed) {
        featureCounts[feature] = (featureCounts[feature] ?? 0) + 1;
      }
    }
    const topFeatures = Object.entries(featureCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([feature]) => feature);

    // Quick-exit detection
    const quickExits = completed.filter(
      s => s.durationMs !== null && s.durationMs < QUICK_EXIT_THRESHOLD_MS,
    );
    const quickExitRate = completed.length > 0
      ? quickExits.length / completed.length
      : 0;

    const insights: UsageInsight[] = [];

    if (topFeatures.length > 0) {
      insights.push({
        type: 'top-features',
        message: `Most used features: ${topFeatures.slice(0, 3).join(', ')}`,
        data: { ranked: topFeatures, counts: featureCounts },
      });
    }

    if (completed.length >= 3 && quickExitRate > 0.3) {
      insights.push({
        type: 'quick-exit-rate',
        message: `${(quickExitRate * 100).toFixed(0)}% of sessions exit within ${QUICK_EXIT_THRESHOLD_MS / 1000}s — possible UX friction`,
        data: { quickExitRate, quickExitCount: quickExits.length, threshold: QUICK_EXIT_THRESHOLD_MS },
      });
    }

    return {
      topFeatures,
      quickExitRate: Math.round(quickExitRate * 1000) / 1000,
      quickExitCount: quickExits.length,
      totalCompletedSessions: completed.length,
      insights,
    };
  }

  // =====================================================================
  // L2=8: Quality Timeseries — 시계열 영속 + 추세 분석
  // =====================================================================

  private timeseriesPath: string | null = null;
  private snapshotInterval = 10;
  private lastSnapshotAt = 0;

  /** Initialize timeseries persistence. Call once at server start. */
  initTimeseries(dataDir: string): void {
    const dir = path.join(dataDir, 'learning');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.timeseriesPath = path.join(dir, 'quality_timeseries.jsonl');
  }

  /** Record a quality snapshot if interval reached. Called on disconnect. */
  maybeRecordSnapshot(): void {
    const completed = Array.from(this.sessions.values()).filter(s => s.disconnectedAt !== null);
    if (completed.length - this.lastSnapshotAt < this.snapshotInterval) return;
    this.lastSnapshotAt = completed.length;

    if (!this.timeseriesPath) return;

    const recent = completed.slice(-this.snapshotInterval);
    const avgDuration = recent.reduce((s, r) => s + (r.durationMs ?? 0), 0) / recent.length;
    const quickExits = recent.filter(s => s.durationMs !== null && s.durationMs < QUICK_EXIT_THRESHOLD_MS);
    const quickExitRate = quickExits.length / recent.length;

    // Feature diversity
    const featureSet = new Set<string>();
    for (const s of recent) {
      for (const f of s.featuresAccessed) featureSet.add(f);
    }

    const snapshot = {
      ts: new Date().toISOString(),
      completed_sessions: completed.length,
      avg_duration_ms: Math.round(avgDuration),
      quick_exit_rate: Math.round(quickExitRate * 1000) / 1000,
      feature_diversity: featureSet.size,
      features_accessed: Array.from(featureSet),
    };

    try {
      fs.appendFileSync(this.timeseriesPath, JSON.stringify(snapshot) + '\n', 'utf-8');
    } catch (e) {
      console.warn('[usage-tracker] timeseries write failed:', (e as Error).message);
    }
  }

  /** L2=8: Analyze quality trend from persisted timeseries. */
  getQualityTrend(): { trend: string; snapshots: number; detail: string } {
    if (!this.timeseriesPath) {
      return { trend: 'no_data', snapshots: 0, detail: 'Timeseries not initialized' };
    }

    let lines: string[];
    try {
      const raw = fs.readFileSync(this.timeseriesPath, 'utf-8') as string;
      lines = raw.trim().split('\n').filter((l: string) => l.length > 0);
    } catch {
      return { trend: 'no_data', snapshots: 0, detail: 'No timeseries file' };
    }

    if (lines.length < 3) {
      return { trend: 'insufficient', snapshots: lines.length, detail: 'Need >= 3 snapshots' };
    }

    const snapshots = lines.map((l: string) => JSON.parse(l));
    const recent = snapshots.slice(-3);
    const older = snapshots.slice(0, -3);

    if (older.length === 0) {
      return { trend: 'stable', snapshots: snapshots.length, detail: 'Only recent data available' };
    }

    const recentAvgDuration = recent.reduce((s: number, r: any) => s + r.avg_duration_ms, 0) / recent.length;
    const olderAvgDuration = older.reduce((s: number, r: any) => s + r.avg_duration_ms, 0) / older.length;

    const recentQuickExit = recent.reduce((s: number, r: any) => s + r.quick_exit_rate, 0) / recent.length;
    const olderQuickExit = older.reduce((s: number, r: any) => s + r.quick_exit_rate, 0) / older.length;

    let trend = 'stable';
    let detail = '';

    if (recentAvgDuration < olderAvgDuration * 0.7) {
      trend = 'declining';
      detail = `Session duration dropped: ${Math.round(olderAvgDuration)}ms → ${Math.round(recentAvgDuration)}ms`;
    } else if (recentQuickExit > olderQuickExit + 0.15) {
      trend = 'declining';
      detail = `Quick-exit rate increased: ${(olderQuickExit * 100).toFixed(0)}% → ${(recentQuickExit * 100).toFixed(0)}%`;
    } else if (recentAvgDuration > olderAvgDuration * 1.2) {
      trend = 'improving';
      detail = `Session duration increased: ${Math.round(olderAvgDuration)}ms → ${Math.round(recentAvgDuration)}ms`;
    } else {
      detail = 'Metrics within normal range';
    }

    return { trend, snapshots: snapshots.length, detail };
  }
}
