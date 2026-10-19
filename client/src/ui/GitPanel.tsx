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

/**
 * How the code links an 'import' pair (R675): the import line's kind, either direction. A re-export or a
 * literal import('…') links the two as much as an import does — the tag says which, so 'import' is not overclaimed.
 */
export function importLinkKind(
  fileA: string,
  fileB: string,
  edges: readonly (EdgeEnds & Pick<GraphEdge, 'importKind'>)[] | undefined,
): 'import' | 're-export' | 'dynamic' | null {
  const k = pairKey(fileA, fileB);
  const line = (edges ?? []).find(e => e.type === 'import' && edgePairKey(e) === k);
  return line ? (line.importKind ?? 'import') : null;
}

/**
 * The evidence sentence for one pair (R675): how often the two changed together and how many of those
 * commits were large (changed more than `largeLine` files — a release dump or a squash-merged PR).
 */
export function pairEvidence(cc: { frequency: number; largeShared: number }, largeLine: number): string {
  const together = `changed together in ${cc.frequency} commit${cc.frequency === 1 ? '' : 's'}`;
  if (cc.largeShared === 0) return `${together}, none of them over ${largeLine} files`;
  if (cc.largeShared === cc.frequency) return `${together}, every one of them over ${largeLine} files — a bulk commit can join unrelated files`;
  return `${together}, ${cc.largeShared} of them over ${largeLine} files`;
}

export type CouplingFilter = CoChangeStatus | 'all';

/** The list's first view: the hidden pairs when there are any — finding them is what the tab is for. */
export function initialCouplingFilter(statuses: readonly CoChangeStatus[]): CouplingFilter {
  return statuses.includes('hidden') ? 'hidden' : 'all';
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

const FILTER_LABEL: Record<CouplingFilter, string> = {
  hidden: 'hidden', import: 'import', 'off-graph': 'not in graph', all: 'all',
};

function CouplingTab({ stats, edges }: { stats: GitStats; edges: readonly GraphEdge[] | undefined }) {
  const C = useThemeColors();
  const nodeMap = useGraphStore(s => s.nodeMap);
  const selectNode = useGraphStore(s => s.selectNode);
  const statuses = coChangeStatuses(stats.coChanges, edges);
  // null = not picked yet: follow the data (hidden first), so a graph that arrives later still lands on hidden
  const [picked, setPicked] = useState<CouplingFilter | null>(null);
  const [openPair, setOpenPair] = useState<string | null>(null);

  if (stats.coChanges.length === 0) {
    return (
      <div className="px-3 py-4 text-center" style={{ color: C.textSecondary }}>
        Not enough commit history for co-change analysis
      </div>
    );
  }

  const filter = picked ?? initialCouplingFilter(statuses);
  const count = (s: CouplingFilter) => s === 'all' ? statuses.length : statuses.filter(x => x === s).length;
  const rows = stats.coChanges
    .map((cc, i) => ({ cc, status: statuses[i] }))
    .filter(r => filter === 'all' || r.status === filter);

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="text-[10px]" style={{ color: C.textSecondary }}
        title="Pairs of files that changed in the same commits, ranked by how often they move together. hidden: a co-change line with no import between the two files. import: the code links them (import, re-export or import('…')). not in graph: a file of the pair is not a star (not a parsed source file, or deleted), so no line is drawn">
        Files that change together — the {stats.coChanges.length} strongest of {stats.coChangeTotal} pairs. Click a pair for the commits.
      </div>
      <div className="flex gap-1 mb-1" role="group" aria-label="Show pairs">
        {(['hidden', 'import', 'off-graph', 'all'] as const).map(f => (
          <button key={f} onClick={() => { setPicked(f); setOpenPair(null); }}
            aria-pressed={filter === f}
            className="px-1.5 py-0.5 rounded text-[10px]"
            style={{
              color: filter === f ? (f === 'hidden' ? COLORS.coChangeEdge : C.textPrimary) : C.textSecondary,
              background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
            }}>
            {count(f)} {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="py-2 text-[10px]" style={{ color: C.textSecondary }}>
          No {FILTER_LABEL[filter]} pair among these {stats.coChanges.length}.
        </div>
      )}
      {rows.map(({ cc, status }) => {
        const key = `${cc.fileA}\0${cc.fileB}`;
        const open = openPair === key;
        const link = status === 'import' ? importLinkKind(cc.fileA, cc.fileB, edges) : null;
        const tag = status === 'hidden' ? 'hidden' : status === 'off-graph' ? 'no line' : (link ?? 'import');
        const bulk = cc.largeShared === cc.frequency;
        // a pair seen only in bulk commits is weak evidence — its bar does not take the coupling colour
        const strength = bulk ? C.textSecondary : COLORS.coChangeEdge;
        const inGraph = [cc.fileA, cc.fileB].filter(f => nodeMap.has(`file:${f}`));
        return (
          <div key={key} style={{ opacity: status === 'off-graph' && !open ? 0.55 : 1 }}>
            <button onClick={() => setOpenPair(open ? null : key)} aria-expanded={open}
              className="w-full flex items-center gap-1.5 py-0.5 text-left"
              title={`${cc.fileA} ↔ ${cc.fileB}\n${pairEvidence(cc, stats.largeChangesetFiles)}`}>
              <span className="font-mono truncate flex-1" style={{ color: C.textPrimary, fontSize: '9px' }}>
                {cc.fileA.split('/').pop()}
              </span>
              <span className="shrink-0 flex items-center gap-1">
                <span className="w-8 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <span className="block h-full rounded-full" style={{ width: `${cc.coupling * 100}%`, background: strength }} />
                </span>
                <span className="font-mono w-7 text-right" style={{ color: strength, fontSize: '9px' }}>
                  {Math.round(cc.coupling * 100)}%
                </span>
                <span className="font-mono w-11 text-center" style={{ color: status === 'hidden' ? COLORS.coChangeEdge : C.textSecondary, fontSize: '8px' }}>
                  {tag}
                </span>
              </span>
              <span className="font-mono truncate flex-1" style={{ color: C.textPrimary, fontSize: '9px' }}>
                {cc.fileB.split('/').pop()}
              </span>
            </button>
            {open && (
              <div className="ml-1 mb-1.5 pl-2 border-l space-y-0.5 text-[10px]" style={{ borderColor: C.panelBorder, color: C.textSecondary }}>
                <div className="font-mono break-all" style={{ color: C.textPrimary }}>{cc.fileA}</div>
                <div className="font-mono break-all" style={{ color: C.textPrimary }}>{cc.fileB}</div>
                <div>{Math.round(cc.coupling * 100)}% — {pairEvidence(cc, stats.largeChangesetFiles)}</div>
                {cc.shared.map(s => (
                  <div key={s.shortHash} className="flex gap-1.5">
                    <span className="font-mono shrink-0" style={{ color: C.textPrimary }}>{s.shortHash}</span>
                    <span className="truncate flex-1">{s.message}</span>
                    <span className="font-mono shrink-0" style={{ color: s.files > stats.largeChangesetFiles ? C.textPrimary : C.textSecondary }}>
                      {s.files} files
                    </span>
                  </div>
                ))}
                {cc.frequency > cc.shared.length && <div>+{cc.frequency - cc.shared.length} older</div>}
                {inGraph.length > 0 && (
                  <div className="flex gap-1.5 pt-0.5">
                    {inGraph.map(f => (
                      <button key={f} onClick={() => selectNode(`file:${f}`)} className="underline" style={{ color: C.textPrimary }}>
                        show {f.split('/').pop()} in graph
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
