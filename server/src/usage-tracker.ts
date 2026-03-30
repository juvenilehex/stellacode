/** Usage statistics tracker (L2 quality loop — in-app feedback collection) */

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
}
