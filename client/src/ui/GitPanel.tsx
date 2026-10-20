import { useState, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { COLORS, getCommitTypeColor, getCommitTypeLabel, getAgentColor } from '../utils/colors';
import { useThemeColors } from '../hooks/useThemeColors';
import { useGraphStore } from '../store/graph-store';
import { useSettingsStore } from '../store/settings-store';
import type { GitStats, GitCommit, GitCoChange } from '../types/agent';
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

/**
 * Panel text sizes (R699). They follow the UI font-size setting (the Observatory root sets it; 13px by default)
 * but never go under 12px — the list used to be fixed at 8-10px, below what the setting could reach.
 */
const FS = { body: 'max(12px, 1em)', small: 'max(12px, 0.92em)' } as const;

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

type Evidence = Pick<GitCoChange, 'frequency' | 'largeShared' | 'coupling'>;

/**
 * The coupling bar in two parts (R699). The bar's length stays the coupling; the teal part is the share that comes
 * from shared commits of at most the large line, the gray part the share from bigger ones (release dumps, squash
 * merges) — both over the same denominator, so the two add up to the %. No new threshold: the line is the server's.
 */
export function evidenceSplit(cc: Evidence): { small: number; large: number; smallCommits: number } {
  const perCommit = cc.coupling / cc.frequency;
  const smallCommits = cc.frequency - cc.largeShared;
  return { small: perCommit * smallCommits, large: perCommit * cc.largeShared, smallCommits };
}

/**
 * List order (R699). 'commits' (the first view): most shared commits at or under the large line first, then the
 * coupling — a pair joined only by bulk commits sinks but stays listed (R675: marked, not dropped). The 1st pair on
 * this repo was 100% from three release commits; code-maat ranks after dropping commits over its line, which puts
 * pairs with small-commit evidence first. 'percent': the server's order (coupling, then shared commits). Ties keep
 * the incoming order.
 */
export type CouplingSort = 'commits' | 'percent';

export function sortPairs<T>(rows: readonly T[], sort: CouplingSort, evidence: (row: T) => Evidence): T[] {
  if (sort === 'percent') return [...rows];
  const small = (r: T) => evidence(r).frequency - evidence(r).largeShared;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => small(b.row) - small(a.row) || evidence(b.row).coupling - evidence(a.row).coupling || a.i - b.i)
    .map(x => x.row);
}

export type CouplingFilter = CoChangeStatus | 'all';

/** The list's first view: the hidden pairs when there are any — finding them is what the tab is for. */
export function initialCouplingFilter(statuses: readonly CoChangeStatus[]): CouplingFilter {
  return statuses.includes('hidden') ? 'hidden' : 'all';
}

type GitTab = 'timeline' | 'types' | 'hot' | 'coupling';

const listedKey = (cc: { fileA: string; fileB: string }) => `${cc.fileA}\0${cc.fileB}`;

export function GitPanel() {
  const C = useThemeColors();
  const [stats, setStats] = useState<GitStats | null>(null);
  const open = useSettingsStore(s => s.gitPanelOpen);
  const setOpen = useSettingsStore(s => s.setGitPanelOpen);
  const [tab, setTab] = useState<GitTab>('timeline');
  const userPickedTabRef = useRef(false);
  // Co-change choices live here, not in the tab, so a tab switch or closing the panel keeps them (R699).
  // null filter = follow the data (hidden first); undefined pair = not touched yet, the first listed pair stands open.
  const [picked, setPicked] = useState<CouplingFilter | null>(null);
  const [sort, setSort] = useState<CouplingSort>('commits');
  const [openPair, setOpenPair] = useState<string | null | undefined>(undefined);
  const scrollerRef = useRef<HTMLDivElement>(null);
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
  const typeCounts = Object.entries(stats.commitsByType).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="pointer-events-auto">
      {/* Expanded panel — above the pill, centred on it; the pill sits mid-screen (App.tsx), so the panel stays
          inside the viewport at any width (R699: a fixed 384px panel lost its left 51px at 390px). */}
      {open && (
        <div id="git-panel" className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex flex-col rounded-lg overflow-hidden"
          style={{
            width: 'min(30rem, calc(100vw - 2rem))',
            maxHeight: 'min(50dvh, calc(100dvh - 9rem))',
            background: C.panelBg, border: `1px solid ${C.panelBorder}`, fontSize: FS.body,
          }}>

          {/* Tabs */}
          <div className="flex border-b shrink-0" style={{ borderColor: C.panelBorder, fontSize: FS.small }}>
            {(['timeline', 'types', 'hot', 'coupling'] as const).map(t => (
              <button key={t} onClick={() => pickTab(t)} aria-pressed={tab === t}
                className="flex-1 px-2 py-1.5 capitalize"
                style={{
                  color: tab === t ? C.textPrimary : C.textSecondary,
                  borderBottom: tab === t ? `1px solid ${COLORS.directory}` : 'none',
                }}>
                {t === 'coupling' ? 'Co-change' : t}
              </button>
            ))}
          </div>

          {/* Tab content — the one scroll in the panel; the panel grows to the screen before it scrolls */}
          <div ref={scrollerRef} className="overflow-y-auto min-h-0 flex-1">
            {tab === 'timeline' && <TimelineTab commits={stats.recentCommits} />}
            {tab === 'types' && <TypesTab stats={stats} />}
            {tab === 'hot' && <HotFilesTab stats={stats} />}
            {tab === 'coupling' && (
              <CouplingTab stats={stats} edges={graphEdges} scroller={scrollerRef}
                picked={picked} onPick={(f) => { setPicked(f); setOpenPair(undefined); }}
                sort={sort} onSort={(s) => { setSort(s); setOpenPair(undefined); }}
                openPair={openPair} onOpenPair={setOpenPair} />
            )}
          </div>
        </div>
      )}

      {/* Branch indicator + toggle */}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="git-panel"
        title={open ? 'Hide the Git panel' : 'Show the Git panel (commits, hot files, co-change)'}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md"
        style={{ background: C.panelBg, border: `1px solid ${C.panelBorder}`, fontSize: FS.body }}
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
        {/* Mini type badges — the type name is in the title */}
        <div className="flex gap-0.5 ml-1" style={{ fontSize: FS.small }}>
          {typeCounts.map(([type, count]) => (
            <span key={type} className="px-1 rounded font-mono" title={`${getCommitTypeLabel(type)}: ${count} commits`}
              aria-label={`${getCommitTypeLabel(type)} ${count}`}
              style={{ background: `${getCommitTypeColor(type)}22`, color: getCommitTypeColor(type) }}>
              {count}
            </span>
          ))}
        </div>

        {/* Hidden-coupling badge — surfaces StellaCode's unique insight at a glance */}
        {couplingCount > 0 && (
          <span
            className="ml-1 px-1.5 rounded font-mono"
            style={{ background: `${COLORS.coChangeEdge}22`, color: COLORS.coChangeEdge, fontSize: FS.small }}
            title={couplingBadgeTitle(coupling)}
          >
            &#x22C8; {couplingCount}
          </span>
        )}
        <Chevron open={open} up color={C.textSecondary} />
      </button>
    </div>
  );
}

/** ▸/▾ without a font glyph (a missing glyph draws an empty box). `up`: points up when closed (the panel opens upward). */
function Chevron({ open, up = false, color }: { open: boolean; up?: boolean; color: string }) {
  const turn = up ? (open ? 180 : 0) : (open ? 90 : 0);
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="shrink-0 transition-transform"
      style={{ transform: `rotate(${turn}deg)` }}>
      {up
        ? <path d="M1 5.5 L4 2.5 L7 5.5" fill="none" stroke={color} strokeWidth="1.4" />
        : <path d="M2.5 1 L5.5 4 L2.5 7" fill="none" stroke={color} strokeWidth="1.4" />}
    </svg>
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
          <span className="shrink-0 px-1 py-0.5 rounded font-mono mt-0.5"
            style={{ background: `${getCommitTypeColor(c.conventionalType)}22`, color: getCommitTypeColor(c.conventionalType), fontSize: FS.small }}>
            {getCommitTypeLabel(c.conventionalType)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate" style={{ color: C.textPrimary }}>
                {c.subject}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5" style={{ fontSize: FS.small }}>
              {/* Agent indicator */}
              {c.isAgent && (
                <span className="flex items-center gap-0.5">
                  <div className="w-1 h-1 rounded-full"
                    style={{ background: getAgentColor(c.agentName ?? '') }} />
                  <span style={{ color: getAgentColor(c.agentName ?? '') }}>
                    {c.agentName}
                  </span>
                </span>
              )}
              <span style={{ color: C.textSecondary }}>
                {c.author}
              </span>
              <span className="font-mono" style={{ color: C.textSecondary }}>
                {c.shortHash}
              </span>
              <span style={{ color: C.textSecondary }}>
                {formatRelativeTime(c.timestamp)}
              </span>
            </div>
            {/* Files changed */}
            {c.files.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1" style={{ fontSize: FS.small }}>
                {c.files.slice(0, 3).map(f => (
                  <span key={f} className="font-mono truncate max-w-32"
                    style={{ color: C.textSecondary }}>
                    {f.split('/').pop()}
                  </span>
                ))}
                {c.files.length > 3 && (
                  <span style={{ color: C.textSecondary }}>
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
    <div className="px-3 py-2 space-y-2" style={{ fontSize: FS.small }}>
      <div className="mb-2" style={{ color: C.textSecondary }}>
        Conventional Commit breakdown
      </div>
      {sorted.map(([type, count]) => (
        <div key={type} className="flex items-center gap-2">
          <span className="w-14 text-right font-mono shrink-0"
            style={{ color: getCommitTypeColor(type) }}>
            {type}
          </span>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(count / max) * 100}%`, background: getCommitTypeColor(type), opacity: 0.7 }} />
          </div>
          <span className="w-8 text-right font-mono shrink-0" style={{ color: C.textPrimary }}>
            {count}
          </span>
        </div>
      ))}

      {/* Activity heatmap */}
      {stats.activityHeatmap.length > 0 && (
        <div className="pt-2 mt-2" style={{ borderTop: `1px solid ${C.panelBorder}` }}>
          <div className="mb-1" style={{ color: C.textSecondary }}>Last 30 days</div>
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
    <div className="px-3 py-2 space-y-1" style={{ fontSize: FS.small }}>
      <div className="mb-2" style={{ color: C.textSecondary }}>
        Most frequently changed files
      </div>
      {stats.hotFiles.map(f => (
        <div key={f.path} className="flex items-center gap-2">
          <span className="flex-1 truncate font-mono" style={{ color: C.textPrimary }}>
            {f.path}
          </span>
          <div className="w-16 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full"
              style={{ width: `${(f.changeCount / max) * 100}%`, background: COLORS.commitFix, opacity: 0.7 }} />
          </div>
          <span className="w-8 text-right font-mono shrink-0" style={{ color: C.textSecondary }}>
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

interface CouplingTabProps {
  stats: GitStats;
  edges: readonly GraphEdge[] | undefined;
  scroller: RefObject<HTMLDivElement | null>;
  picked: CouplingFilter | null;
  onPick: (f: CouplingFilter) => void;
  sort: CouplingSort;
  onSort: (s: CouplingSort) => void;
  openPair: string | null | undefined;
  onOpenPair: (key: string | null) => void;
}

function CouplingTab({ stats, edges, scroller, picked, onPick, sort, onSort, openPair, onOpenPair }: CouplingTabProps) {
  const C = useThemeColors();
  const nodeMap = useGraphStore(s => s.nodeMap);
  const selectNode = useGraphStore(s => s.selectNode);
  const statuses = coChangeStatuses(stats.coChanges, edges);
  // a pair the reader just opened scrolls into the list's view — only on their click, never on a restore
  const [revealKey, setRevealKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!revealKey || !box) return;
    const el = box.querySelector<HTMLElement>(`[data-pair="${CSS.escape(revealKey)}"]`);
    if (el) {
      const top = el.offsetTop - box.offsetTop;
      const bottom = top + el.offsetHeight;
      if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = Math.min(top, bottom - box.clientHeight);
    }
    setRevealKey(null);
  }, [revealKey, scroller]);

  if (stats.coChanges.length === 0) {
    return (
      <div className="px-3 py-4 text-center" style={{ color: C.textSecondary }}>
        Not enough commit history for co-change analysis
      </div>
    );
  }

  const filter = picked ?? initialCouplingFilter(statuses);
  const count = (s: CouplingFilter) => s === 'all' ? statuses.length : statuses.filter(x => x === s).length;
  const rows = sortPairs(
    stats.coChanges.map((cc, i) => ({ cc, status: statuses[i] })).filter(r => filter === 'all' || r.status === filter),
    sort, r => r.cc,
  );
  // until the reader opens or closes a pair, the first listed one stands open: its commits are on the first screen
  const openKey = openPair === undefined ? (rows[0] ? listedKey(rows[0].cc) : null) : openPair;
  // in a one-status view every row would repeat the chip just picked; the tag column only speaks in 'all'
  const showTag = filter === 'all';
  const largeLine = stats.largeChangesetFiles;
  const sortButton = (s: CouplingSort, label: string, width: string, title: string) => (
    <button onClick={() => onSort(s)} aria-pressed={sort === s} title={title}
      className={`${width} text-right shrink-0 font-mono rounded`}
      style={{ color: sort === s ? C.textPrimary : C.textSecondary, textDecoration: sort === s ? 'underline' : 'none' }}>
      {label}{sort === s ? '↓' : ''}
    </button>
  );

  return (
    <div className="px-3 py-2 space-y-1">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Show pairs" style={{ fontSize: FS.small }}>
        {(['hidden', 'import', 'off-graph', 'all'] as const).map(f => (
          <button key={f} onClick={() => onPick(f)}
            aria-pressed={filter === f}
            className="px-1.5 py-0.5 rounded"
            style={{
              color: filter === f ? (f === 'hidden' ? COLORS.coChangeEdge : C.textPrimary) : C.textSecondary,
              background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
            }}>
            {count(f)} {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Column heads — the two numbers of each row, and the sort */}
      <div className="flex items-center gap-1.5 pt-1" style={{ color: C.textSecondary, fontSize: FS.small }}
        title={`Pairs of files that changed in the same commits — the ${stats.coChanges.length} with the highest % of ${stats.coChangeTotal} pairs seen in 3 or more commits.\n`
          + `%: commits that changed both ÷ commits of the busier file.\n`
          + `commits: shared commits of ${largeLine} files or fewer / all shared commits. Bigger commits (a release dump, a squash merge) can join unrelated files — they count in the %, and their part of the bar is gray.\n`
          + `hidden: a co-change line with no import between the two files. import: the code links them (import, re-export or import('…')). not in graph: a file of the pair is not a star, so no line is drawn. Click a pair for its commits.`}>
        {/* spacers match the row's chevron and bar so the heads sit over their numbers */}
        <span className="w-2 shrink-0" />
        <span className="flex-1 min-w-0 truncate">{stats.coChanges.length} of {stats.coChangeTotal} pairs</span>
        <span className="w-8 shrink-0" />
        {sortButton('percent', '%', 'w-[5ch]', 'Sort by % (how often the two change together)')}
        {sortButton('commits', 'commits', 'w-[8ch]', `Sort by shared commits of ${largeLine} files or fewer`)}
        {showTag && <span className="w-[7ch] shrink-0" />}
        <span className="flex-1 min-w-0" />
      </div>

      {rows.length === 0 && (
        <div className="py-2" style={{ color: C.textSecondary, fontSize: FS.small }}>
          No {FILTER_LABEL[filter]} pair among these {stats.coChanges.length}.
        </div>
      )}
      {rows.map(({ cc, status }) => {
        const key = listedKey(cc);
        const open = openKey === key;
        const link = status === 'import' ? importLinkKind(cc.fileA, cc.fileB, edges) : null;
        const tag = status === 'hidden' ? 'hidden' : status === 'off-graph' ? 'no line' : (link ?? 'import');
        const split = evidenceSplit(cc);
        const inGraph = [cc.fileA, cc.fileB].filter(f => nodeMap.has(`file:${f}`));
        return (
          <div key={key} data-pair={key} style={{ opacity: status === 'off-graph' && !open ? 0.55 : 1 }}>
            <button
              onClick={() => { onOpenPair(open ? null : key); if (!open) setRevealKey(key); }}
              aria-expanded={open}
              className="w-full flex items-center gap-1.5 py-0.5 text-left"
              title={`${cc.fileA} ↔ ${cc.fileB}\n${pairEvidence(cc, largeLine)}`}>
              <Chevron open={open} color={C.textSecondary} />
              <span className="font-mono truncate flex-1 min-w-0" style={{ color: C.textPrimary }}>
                {cc.fileA.split('/').pop()}
              </span>
              {/* bar: teal = commits of ≤ largeLine files, gray = bigger commits; length = the % */}
              <span className="w-8 h-1 rounded-full overflow-hidden flex shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <span className="block h-full" style={{ width: `${split.small * 100}%`, background: COLORS.coChangeEdge }} />
                <span className="block h-full" style={{ width: `${split.large * 100}%`, background: C.textSecondary }} />
              </span>
              <span className="font-mono w-[5ch] text-right shrink-0" style={{ color: C.textPrimary, fontSize: FS.small }}>
                {Math.round(cc.coupling * 100)}%
              </span>
              <span className="font-mono w-[8ch] text-right shrink-0" style={{ fontSize: FS.small }}
                title={`${split.smallCommits} of ${cc.frequency} shared commits changed ${largeLine} files or fewer`}>
                <span style={{ color: split.smallCommits > 0 ? COLORS.coChangeEdge : C.textSecondary }}>{split.smallCommits}</span>
                <span style={{ color: C.textSecondary }}>/{cc.frequency}</span>
              </span>
              {showTag && (
                <span className="font-mono w-[7ch] text-center shrink-0" style={{ color: status === 'hidden' ? COLORS.coChangeEdge : C.textSecondary, fontSize: FS.small }}>
                  {tag}
                </span>
              )}
              <span className="font-mono truncate flex-1 min-w-0" style={{ color: C.textPrimary }}>
                {cc.fileB.split('/').pop()}
              </span>
            </button>
            {open && (
              <div className="ml-1 mb-1.5 pl-2 border-l space-y-0.5" style={{ borderColor: C.panelBorder, color: C.textSecondary, fontSize: FS.small }}>
                <div className="font-mono break-all" style={{ color: C.textPrimary }}>{cc.fileA}</div>
                <div className="font-mono break-all" style={{ color: C.textPrimary }}>{cc.fileB}</div>
                <div>{Math.round(cc.coupling * 100)}% — {pairEvidence(cc, largeLine)}</div>
                {cc.shared.map(s => (
                  <div key={s.shortHash} className="flex gap-1.5">
                    <span className="font-mono shrink-0" style={{ color: C.textPrimary }}>{s.shortHash}</span>
                    <span className="truncate flex-1 min-w-0" title={s.message}>{s.message}</span>
                    <span className="font-mono shrink-0" style={{ color: s.files > largeLine ? C.textPrimary : C.textSecondary }}>
                      {s.files} files
                    </span>
                  </div>
                ))}
                {cc.frequency > cc.shared.length && <div>+{cc.frequency - cc.shared.length} older</div>}
                {inGraph.length > 0 && (
                  <div className="flex flex-wrap gap-x-1.5 pt-0.5">
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
