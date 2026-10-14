import { useState, useEffect, useMemo, useRef } from 'react';
import { COLORS, getCommitTypeColor, getCommitTypeLabel, getAgentColor } from '../utils/colors';
import { useThemeColors } from '../hooks/useThemeColors';
import { useGraphStore } from '../store/graph-store';
import type { GitStats, GitCommit } from '../types/agent';
import type { GraphEdge } from '../types/graph';

/**
 * 커플링 수의 단일 정의 (R639). 배지는 화면에 그려진 co-change 선을 센다.
 * 선과 /api/git/stats 의 coChanges 는 서버의 같은 계산(연 폴더로 먼저 좁힌 같은 커밋 창 —
 * tracker.getCoChangeLog, R657)에서 나온다. 목록에만 있는 쌍은 노드가 없는 파일(LICENSE·css·md 처럼
 * 파서가 별로 만들지 않는 파일, 또는 지워진 파일)이 낀 쌍이다.
 * 목록 수는 listed 로 따로 돌려주고, 둘이 다르면 툴팁이 그 차이를 말한다.
 */
type EdgeEnds = Pick<GraphEdge, 'type' | 'source' | 'target'>;

const pairKey = (a: string, b: string) => [a, b].sort().join('\0');
const edgePairKey = (e: EdgeEnds) => pairKey(e.source.replace(/^file:/, ''), e.target.replace(/^file:/, ''));

function importPairs(edges: readonly EdgeEnds[]): Set<string> {
  return new Set(edges.filter(e => e.type === 'import').map(edgePairKey));
}

export function couplingCounts(
  coChanges: readonly { fileA: string; fileB: string }[] | undefined,
  edges: readonly EdgeEnds[] | undefined,
): { drawn: number; listed: number; alongsideImport: number } {
  const all = edges ?? [];
  const imports = importPairs(all);
  const lines = all.filter(e => e.type === 'co-change');
  return {
    drawn: lines.length,
    listed: coChanges?.length ?? 0,
    alongsideImport: lines.filter(e => imports.has(edgePairKey(e))).length,
  };
}

export function couplingBadgeTitle({ drawn, listed, alongsideImport }: { drawn: number; listed: number; alongsideImport: number }): string {
  const head = `${drawn} co-change link${drawn === 1 ? '' : 's'} in the graph (lines; hidden while the Co-change filter is off) — files that change together in git history`;
  const split = alongsideImport > 0
    ? `. ${drawn - alongsideImport} share no import (hidden coupling); ${alongsideImport} run alongside an import`
    : '';
  return listed !== drawn
    ? `${head}${split}. The Co-change tab also lists ${listed - drawn} pair${listed - drawn === 1 ? '' : 's'} with a file that is not in the graph`
    : `${head}${split}`;
}

/**
 * What the graph says about one listed pair (R657):
 * hidden = drawn and no import between the two — the coupling nothing in the code shows;
 * import = drawn, but an import already connects them — expected coupling;
 * off-graph = no line, because a file of the pair has no star (not a parsed source file, or deleted).
 */
export type CoChangeStatus = 'hidden' | 'import' | 'off-graph';

export function coChangeStatuses(
  coChanges: readonly { fileA: string; fileB: string }[],
  edges: readonly EdgeEnds[] | undefined,
): CoChangeStatus[] {
  const all = edges ?? [];
  const imports = importPairs(all);
  const drawn = new Set(all.filter(e => e.type === 'co-change').map(edgePairKey));
  return coChanges.map(({ fileA, fileB }) => {
    const k = pairKey(fileA, fileB);
    if (!drawn.has(k)) return 'off-graph';
    return imports.has(k) ? 'import' : 'hidden';
  });
}

type GitTab = 'timeline' | 'types' | 'hot' | 'coupling';

export function GitPanel() {
  const C = useThemeColors();
  const [stats, setStats] = useState<GitStats | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GitTab>('timeline');
  const userPickedTabRef = useRef(false);
  const graphVersion = useGraphStore(s => s.graphVersion);
  const graphEdges = useGraphStore(s => s.data?.edges);

  useEffect(() => {
    // graphVersion은 그래프 업데이트마다 bump → 이 effect가 반복 재발화한다.
    // cancelled 가드 없이는 이전 요청이 늦게 도착해 최신 stats/tab을 덮는 race가
    // 생긴다(형제 useGraphData와 동일 패턴). 응답 도착 시 stale면 상태 갱신을 막는다.
    let cancelled = false;
    fetch('/api/git/stats')
      .then(r => r.ok ? r.json() : null)
      .then((data: GitStats | null) => {
        if (cancelled) return;
        setStats(data);
        // Lead with the unique insight: if hidden couplings exist, default the
        // panel to the Co-change tab so the differentiated value surfaces first
        // instead of a commodity commit timeline. Falls back to timeline when
        // there's nothing to show, and never overrides a manual tab choice.
        if (data && !userPickedTabRef.current) {
          setTab(data.coChanges?.length ? 'coupling' : 'timeline');
        }
      })
      .catch((err) => { if (!cancelled) console.warn('[GitPanel] Failed to fetch stats:', err); });
    return () => { cancelled = true; };
  }, [graphVersion]);

  if (!stats || stats.totalCommits === 0) return null;

  function pickTab(t: GitTab) {
    userPickedTabRef.current = true;
    setTab(t);
  }

  const coupling = couplingCounts(stats.coChanges, graphEdges);
  const couplingCount = coupling.drawn;

  return (
    <div className="pointer-events-auto">
      {/* Branch indicator + toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
        style={{ background: C.panelBg, border: `1px solid ${C.panelBorder}` }}
      >
        {/* Branch status dot */}
        <div className="w-1.5 h-1.5 rounded-full"
          style={{ background: stats.isClean ? COLORS.branchClean : COLORS.branchDirty }} />
        <span className="font-mono" style={{ color: C.textPrimary }}>
          {stats.currentBranch || 'detached'}
        </span>
        <span style={{ color: C.textSecondary }}>
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

        {/* Hidden-coupling badge — surfaces StellaCode's unique insight at a glance */}
        {couplingCount > 0 && (
          <span
            className="ml-1 px-1.5 rounded text-[9px] font-mono"
            style={{ background: `${COLORS.coChangeEdge}22`, color: COLORS.coChangeEdge }}
            title={couplingBadgeTitle(coupling)}
          >
            &#x22C8; {couplingCount}
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-96 max-h-80 rounded-lg overflow-hidden"
          style={{ background: C.panelBg, border: `1px solid ${C.panelBorder}` }}>

          {/* Tabs */}
          <div className="flex border-b text-[10px]" style={{ borderColor: C.panelBorder }}>
            {(['timeline', 'types', 'hot', 'coupling'] as const).map(t => (
              <button key={t} onClick={() => pickTab(t)}
                className="flex-1 px-2 py-1.5 capitalize"
                style={{
                  color: tab === t ? C.textPrimary : C.textSecondary,
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
            {tab === 'coupling' && <CouplingTab stats={stats} edges={graphEdges} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline: recent commits ──

function TimelineTab({ commits }: { commits: GitCommit[] }) {
  const C = useThemeColors();
  return (
    <div className="divide-y" style={{ borderColor: C.panelBorder }}>
      {commits.map(c => (
        <div key={c.hash} className="px-3 py-1.5 flex items-start gap-2">
          {/* Type badge */}
          <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-mono mt-0.5"
            style={{ background: `${getCommitTypeColor(c.conventionalType)}22`, color: getCommitTypeColor(c.conventionalType) }}>
            {getCommitTypeLabel(c.conventionalType)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate" style={{ color: C.textPrimary }}>
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
              <span style={{ color: C.textSecondary, fontSize: '9px' }}>
                {c.author}
              </span>
              <span className="font-mono" style={{ color: C.textSecondary, fontSize: '9px' }}>
                {c.shortHash}
              </span>
              <span style={{ color: C.textSecondary, fontSize: '9px' }}>
                {formatRelativeTime(c.timestamp)}
              </span>
            </div>
            {/* Files changed */}
            {c.files.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {c.files.slice(0, 3).map(f => (
                  <span key={f} className="font-mono truncate max-w-32"
                    style={{ color: C.textSecondary, fontSize: '9px' }}>
                    {f.split('/').pop()}
                  </span>
                ))}
                {c.files.length > 3 && (
                  <span style={{ color: C.textSecondary, fontSize: '9px' }}>
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
  const C = useThemeColors();
  const sorted = useMemo(() =>
    Object.entries(stats.commitsByType).sort((a, b) => b[1] - a[1]),
    [stats.commitsByType]
  );
  const max = Math.max(...sorted.map(([, v]) => v), 1);

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="text-[10px] mb-2" style={{ color: C.textSecondary }}>
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
          <span className="w-8 text-right font-mono shrink-0" style={{ color: C.textPrimary, fontSize: '10px' }}>
            {count}
          </span>
        </div>
      ))}

      {/* Activity heatmap */}
      {stats.activityHeatmap.length > 0 && (
        <div className="pt-2 mt-2" style={{ borderTop: `1px solid ${C.panelBorder}` }}>
          <div className="text-[10px] mb-1" style={{ color: C.textSecondary }}>Last 30 days</div>
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
  const C = useThemeColors();
  const max = Math.max(...stats.hotFiles.map(f => f.changeCount), 1);

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[10px] mb-2" style={{ color: C.textSecondary }}>
        Most frequently changed files
      </div>
      {stats.hotFiles.map(f => (
        <div key={f.path} className="flex items-center gap-2">
          <span className="flex-1 truncate font-mono" style={{ color: C.textPrimary, fontSize: '10px' }}>
            {f.path}
          </span>
          <div className="w-16 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full"
              style={{ width: `${(f.changeCount / max) * 100}%`, background: COLORS.commitFix, opacity: 0.7 }} />
          </div>
          <span className="w-6 text-right font-mono shrink-0" style={{ color: C.textSecondary, fontSize: '9px' }}>
            {f.changeCount}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Coupling: files that change together ──

function CouplingTab({ stats, edges }: { stats: GitStats; edges: readonly GraphEdge[] | undefined }) {
  const C = useThemeColors();
  if (stats.coChanges.length === 0) {
    return (
      <div className="px-3 py-4 text-center" style={{ color: C.textSecondary }}>
        Not enough commit history for co-change analysis
      </div>
    );
  }

  const statuses = coChangeStatuses(stats.coChanges, edges);
  const count = (s: CoChangeStatus) => statuses.filter(x => x === s).length;

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[10px] mb-2" style={{ color: C.textSecondary }}
        title="hidden: a co-change line with no import between the two files. import: an import already connects them. not in graph: a file of the pair is not a star (not a parsed source file, or deleted), so no line is drawn">
        Files that frequently change together (temporal coupling) — of {stats.coChanges.length}:{' '}
        <span style={{ color: COLORS.coChangeEdge }}>{count('hidden')} hidden</span>
        {' · '}{count('import')} also import{' · '}{count('off-graph')} not in graph
      </div>
      {stats.coChanges.slice(0, 15).map((cc, i) => {
        const status = statuses[i];
        const tag = status === 'import' ? 'import' : status === 'off-graph' ? 'no line' : '';
        const why = status === 'hidden' ? 'line in the graph, no import between them'
          : status === 'import' ? 'line in the graph, alongside an import'
          : 'no line: a file of this pair is not in the graph';
        return (
          <div key={i} className="flex items-center gap-1.5 py-0.5"
            style={{ opacity: status === 'off-graph' ? 0.45 : 1 }}
            title={`${cc.fileA} ↔ ${cc.fileB}\n${cc.frequency} commits together · ${why}`}>
            <span className="font-mono truncate flex-1" style={{ color: C.textPrimary, fontSize: '9px' }}>
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
              <span className="font-mono w-9 text-center" style={{ color: C.textSecondary, fontSize: '8px' }}>
                {tag}
              </span>
            </div>
            <span className="font-mono truncate flex-1 text-right" style={{ color: C.textPrimary, fontSize: '9px' }}>
              {cc.fileB.split('/').pop()}
            </span>
          </div>
        );
      })}
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
