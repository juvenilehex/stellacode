import { useState, useEffect, useMemo } from 'react';
import { COLORS, getCommitTypeColor, getCommitTypeLabel, getAgentColor } from '../utils/colors';
import type { GitStats, GitCommit } from '../types/agent';

export function GitPanel() {
  const [stats, setStats] = useState<GitStats | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'timeline' | 'types' | 'hot' | 'coupling'>('timeline');

  useEffect(() => {
    fetch('/api/git/stats')
      .then(r => r.ok ? r.json() : null)
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats || stats.totalCommits === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
      {/* Branch indicator + toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
        style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}
      >
        {/* Branch status dot */}
        <div className="w-1.5 h-1.5 rounded-full"
          style={{ background: stats.isClean ? COLORS.branchClean : COLORS.branchDirty }} />
        <span className="font-mono" style={{ color: COLORS.textPrimary }}>
          {stats.currentBranch || 'detached'}
        </span>
        <span style={{ color: COLORS.textSecondary }}>
          {stats.totalCommits} commits
        </span>
        {/* Mini type badges */}
        <div className="flex gap-0.5 ml-1">
          {Object.entries(stats.commitsByType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([type, count]) => (
              <span key={type} className="px-1 rounded text-[9px] font-mono"
                style={{ background: `${getCommitTypeColor(type)}22`, color: getCommitTypeColor(type) }}>
                {count}
              </span>
            ))}
        </div>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-96 max-h-80 rounded-lg overflow-hidden"
          style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}>

          {/* Tabs */}
          <div className="flex border-b text-[10px]" style={{ borderColor: COLORS.panelBorder }}>
            {(['timeline', 'types', 'hot', 'coupling'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="flex-1 px-2 py-1.5 capitalize"
                style={{
                  color: tab === t ? COLORS.textPrimary : COLORS.textSecondary,
                  borderBottom: tab === t ? `1px solid ${COLORS.directory}` : 'none',
                }}>
                {t === 'coupling' ? 'Co-change' : t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="overflow-y-auto max-h-64 text-xs">
            {tab === 'timeline' && <TimelineTab commits={stats.recentCommits} />}
            {tab === 'types' && <TypesTab stats={stats} />}
            {tab === 'hot' && <HotFilesTab stats={stats} />}
            {tab === 'coupling' && <CouplingTab stats={stats} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline: recent commits ──

function TimelineTab({ commits }: { commits: GitCommit[] }) {
  return (
    <div className="divide-y" style={{ borderColor: COLORS.panelBorder }}>
      {commits.map(c => (
        <div key={c.hash} className="px-3 py-1.5 flex items-start gap-2">
          {/* Type badge */}
          <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-mono mt-0.5"
            style={{ background: `${getCommitTypeColor(c.conventionalType)}22`, color: getCommitTypeColor(c.conventionalType) }}>
            {getCommitTypeLabel(c.conventionalType)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate" style={{ color: COLORS.textPrimary }}>
                {c.subject}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {/* Agent indicator */}
              {c.isAgent && (
                <span className="flex items-center gap-0.5">
                  <div className="w-1 h-1 rounded-full"
                    style={{ background: getAgentColor(c.agentName ?? '') }} />
                  <span style={{ color: getAgentColor(c.agentName ?? ''), fontSize: '9px' }}>
                    {c.agentName}
                  </span>
                </span>
              )}
              <span style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
                {c.author}
              </span>
              <span className="font-mono" style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
                {c.shortHash}
              </span>
              <span style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
                {formatRelativeTime(c.timestamp)}
              </span>
            </div>
            {/* Files changed */}
            {c.files.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {c.files.slice(0, 3).map(f => (
                  <span key={f} className="font-mono truncate max-w-32"
                    style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
                    {f.split('/').pop()}
                  </span>
                ))}
                {c.files.length > 3 && (
                  <span style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
                    +{c.files.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Types: commit type breakdown ──

function TypesTab({ stats }: { stats: GitStats }) {
  const sorted = useMemo(() =>
    Object.entries(stats.commitsByType).sort((a, b) => b[1] - a[1]),
    [stats.commitsByType]
  );
  const max = Math.max(...sorted.map(([, v]) => v), 1);

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="text-[10px] mb-2" style={{ color: COLORS.textSecondary }}>
        Conventional Commit breakdown
      </div>
      {sorted.map(([type, count]) => (
        <div key={type} className="flex items-center gap-2">
          <span className="w-12 text-right font-mono shrink-0"
            style={{ color: getCommitTypeColor(type), fontSize: '10px' }}>
            {type}
          </span>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(count / max) * 100}%`, background: getCommitTypeColor(type), opacity: 0.7 }} />
          </div>
          <span className="w-8 text-right font-mono shrink-0" style={{ color: COLORS.textPrimary, fontSize: '10px' }}>
            {count}
          </span>
        </div>
      ))}

      {/* Activity heatmap */}
      {stats.activityHeatmap.length > 0 && (
        <div className="pt-2 mt-2" style={{ borderTop: `1px solid ${COLORS.panelBorder}` }}>
          <div className="text-[10px] mb-1" style={{ color: COLORS.textSecondary }}>Last 30 days</div>
          <div className="flex gap-0.5 flex-wrap">
            {stats.activityHeatmap.map(d => {
              const intensity = Math.min(d.count / 5, 1);
              return (
                <div key={d.date} className="w-2.5 h-2.5 rounded-sm" title={`${d.date}: ${d.count} commits`}
                  style={{ background: `rgba(126, 220, 204, ${0.1 + intensity * 0.8})` }} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hot Files: most changed ──

function HotFilesTab({ stats }: { stats: GitStats }) {
  const max = Math.max(...stats.hotFiles.map(f => f.changeCount), 1);

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[10px] mb-2" style={{ color: COLORS.textSecondary }}>
        Most frequently changed files
      </div>
      {stats.hotFiles.map(f => (
        <div key={f.path} className="flex items-center gap-2">
          <span className="flex-1 truncate font-mono" style={{ color: COLORS.textPrimary, fontSize: '10px' }}>
            {f.path}
          </span>
          <div className="w-16 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full"
              style={{ width: `${(f.changeCount / max) * 100}%`, background: COLORS.commitFix, opacity: 0.7 }} />
          </div>
          <span className="w-6 text-right font-mono shrink-0" style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
            {f.changeCount}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Coupling: files that change together ──

function CouplingTab({ stats }: { stats: GitStats }) {
  if (stats.coChanges.length === 0) {
    return (
      <div className="px-3 py-4 text-center" style={{ color: COLORS.textSecondary }}>
        Not enough commit history for co-change analysis
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[10px] mb-2" style={{ color: COLORS.textSecondary }}>
        Files that frequently change together (temporal coupling)
      </div>
      {stats.coChanges.slice(0, 15).map((cc, i) => (
        <div key={i} className="flex items-center gap-1.5 py-0.5">
          <span className="font-mono truncate flex-1" style={{ color: COLORS.textPrimary, fontSize: '9px' }}>
            {cc.fileA.split('/').pop()}
          </span>
          <div className="shrink-0 flex items-center gap-1">
            <div className="w-8 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full rounded-full"
                style={{ width: `${cc.coupling * 100}%`, background: COLORS.coChangeEdge }} />
            </div>
            <span className="font-mono" style={{ color: COLORS.coChangeEdge, fontSize: '9px' }}>
              {Math.round(cc.coupling * 100)}%
            </span>
          </div>
          <span className="font-mono truncate flex-1 text-right" style={{ color: COLORS.textPrimary, fontSize: '9px' }}>
            {cc.fileB.split('/').pop()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}
