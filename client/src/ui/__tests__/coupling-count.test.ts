/**
 * 커플링 수는 한 정의다 (R639, merge_candidates L304).
 * 배지가 /api/git/stats 의 coChanges 길이(500커밋·전 파일)를 세서 "50"이라 하고
 * 화면의 co-change 선은 34개였다. 배지는 그려진 선을 센다.
 * R657: 목록의 쌍마다 그래프가 말하는 상태(숨은 결합 / import 도 있음 / 그래프에 없음)를 가른다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { couplingCounts, couplingBadgeTitle, coChangeStatuses, importLinkKind, pairEvidence, initialCouplingFilter, evidenceSplit, sortPairs } from '../GitPanel';
import { legendLanguages } from '../Legend';

const coChanges = [
  { fileA: 'a.ts', fileB: 'b.ts' },
  { fileA: 'a.ts', fileB: 'README.md' },
  { fileA: 'd.ts', fileB: 'c.ts' },
];
const edges = [
  { type: 'import' as const, source: 'file:c.ts', target: 'file:d.ts' },
  { type: 'co-change' as const, source: 'file:a.ts', target: 'file:b.ts' },
  { type: 'co-change' as const, source: 'file:c.ts', target: 'file:d.ts' },
  { type: 'directory' as const, source: 'dir:', target: 'file:a.ts' },
];

describe('커플링 수 단일 정의', () => {
  it('배지 수 = 그래프에 그려진 co-change 선 수, 그중 import 와 나란한 선을 따로 센다', () => {
    expect(couplingCounts(coChanges, edges)).toEqual({ drawn: 2, listed: 3, alongsideImport: 1 });
  });

  it('둘이 다르면 툴팁이 차이를 말하고, 선 전부를 숨은 결합이라 주장하지 않는다', () => {
    const t = couplingBadgeTitle({ drawn: 35, listed: 50, alongsideImport: 10 });
    expect(t).toMatch(/^35 /);
    expect(t).toContain('25 share no import');
    expect(t).toContain('10 run alongside an import');
    expect(t).toContain('15 pairs with a file that is not in the graph');
  });

  it('배지가 coChanges 길이를 직접 세지 않는다', () => {
    const src = readFileSync(join(__dirname, '..', 'GitPanel.tsx'), 'utf-8');
    expect(src).not.toMatch(/couplingCount\s*=\s*stats\.coChanges/);
  });
});

describe('Co-change 탭의 쌍 상태 (R657)', () => {
  it('선 있음+import 없음 = hidden, 선 있음+import = import, 선 없음 = off-graph (쌍 방향 무관)', () => {
    expect(coChangeStatuses(coChanges, edges)).toEqual(['hidden', 'off-graph', 'import']);
  });

  it('그래프가 아직 없으면 전부 off-graph — 숨은 결합이라 부르지 않는다', () => {
    expect(coChangeStatuses(coChanges, undefined)).toEqual(['off-graph', 'off-graph', 'off-graph']);
  });
});

// R675: the tab gives the reason, not only the score — what links an 'import' pair, how much of the
// evidence is bulk commits, and which pairs the list opens on.
describe('Co-change 탭의 근거 (R675)', () => {
  const linked = [
    { type: 'import' as const, source: 'file:b.ts', target: 'file:a.ts', importKind: 're-export' as const },
    { type: 'import' as const, source: 'file:c.ts', target: 'file:d.ts', importKind: 'dynamic' as const },
    { type: 'import' as const, source: 'file:e.ts', target: 'file:f.ts' },
  ];

  it('import 쌍은 어떤 종류의 참조로 이어졌는지 말한다 (방향 무관), 이어지지 않았으면 null', () => {
    expect(importLinkKind('a.ts', 'b.ts', linked)).toBe('re-export');
    expect(importLinkKind('d.ts', 'c.ts', linked)).toBe('dynamic');
    expect(importLinkKind('e.ts', 'f.ts', linked)).toBe('import');
    expect(importLinkKind('a.ts', 'z.ts', linked)).toBeNull();
  });

  it('함께 바뀐 커밋이 전부 큰 커밋이면 그렇다고 말한다', () => {
    expect(pairEvidence({ frequency: 3, largeShared: 3 }, 30)).toBe(
      'changed together in 3 commits, every one of them over 30 files — a bulk commit can join unrelated files');
    expect(pairEvidence({ frequency: 5, largeShared: 2 }, 30)).toBe('changed together in 5 commits, 2 of them over 30 files');
    expect(pairEvidence({ frequency: 4, largeShared: 0 }, 30)).toBe('changed together in 4 commits, none of them over 30 files');
  });

  it('목록은 숨은 결합이 있으면 그것부터 연다', () => {
    expect(initialCouplingFilter(['off-graph', 'hidden', 'import'])).toBe('hidden');
    expect(initialCouplingFilter(['off-graph', 'import'])).toBe('all');
  });

  it('목록을 앞 15쌍으로 자르지 않는다 — 머리말이 센 쌍은 전부 열 수 있어야 한다', () => {
    const src = readFileSync(join(__dirname, '..', 'GitPanel.tsx'), 'utf-8');
    expect(src).not.toMatch(/coChanges\.slice\(0,\s*15\)/);
  });
});

// R699: the first row on this repo was 100% from three release commits (30·53·61 files) and drew as the strongest
// hidden coupling. The large line stays the server's (> 30, as code-maat's exceeds-max-changeset-size); what changes
// is the order and the bar.
describe('Co-change 목록의 순서와 막대 (R699)', () => {
  const dump = { frequency: 3, largeShared: 2, coupling: 1 };        // 1위였던 LODController.tsx ↔ layout.ts
  const real = { frequency: 4, largeShared: 0, coupling: 0.67 };     // live-watcher.ts ↔ ts-parser.ts
  const mixed = { frequency: 5, largeShared: 2, coupling: 0.83 };    // ConstellationEdge ↔ ConstellationNode
  const allBulk = { frequency: 3, largeShared: 3, coupling: 0.75 };  // AgentPanel ↔ Breadcrumb

  it('막대는 두 구간 — 작은 커밋 몫(청록)과 큰 커밋 몫(회색)의 합이 결합도다', () => {
    const s = evidenceSplit(dump);
    expect(s.smallCommits).toBe(1);
    expect(s.small).toBeCloseTo(1 / 3);
    expect(s.large).toBeCloseTo(2 / 3);
    expect(s.small + s.large).toBeCloseTo(dump.coupling);
    expect(evidenceSplit(allBulk)).toMatchObject({ small: 0, smallCommits: 0 });
    expect(evidenceSplit(real).large).toBe(0);
  });

  it("기본 순서('commits')는 작은 커밋 근거가 많은 쌍부터 — 큰 커밋으로만 묶인 쌍은 내려가되 빠지지 않는다", () => {
    const rows = [dump, mixed, allBulk, real];   // 서버 순서(결합도)
    expect(sortPairs(rows, 'commits', r => r)).toEqual([real, mixed, dump, allBulk]);
    expect(sortPairs(rows, 'percent', r => r)).toEqual(rows);
  });

  it('작은 커밋 수가 같으면 결합도, 그것도 같으면 들어온 순서', () => {
    const a = { frequency: 3, largeShared: 0, coupling: 0.75 };
    const b = { frequency: 3, largeShared: 0, coupling: 0.75 };
    const c = { frequency: 4, largeShared: 1, coupling: 0.8 };
    expect(sortPairs([a, b, c], 'commits', r => r)).toEqual([c, a, b]);
  });

  it('패널이 고정 폭·고정 왼쪽 여백으로 놓이지 않고, 글씨를 12px 아래로 박지 않는다', () => {
    const panel = readFileSync(join(__dirname, '..', 'GitPanel.tsx'), 'utf-8');
    const app = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf-8');
    expect(panel).not.toMatch(/\bw-96\b/);
    expect(app).not.toMatch(/marginLeft:\s*-192/);
    expect(panel).not.toMatch(/text-\[(8|9|10|11)px\]|fontSize:\s*'(8|9|10|11)px'/);
  });
});

describe('범례의 언어 항목 (R699)', () => {
  it('그래프에 파일이 있는 언어만 — 없는 Python 을 고정으로 싣지 않는다', () => {
    expect([...legendLanguages({ typescript: 96, javascript: 2 })].sort()).toEqual(['javascript', 'typescript']);
    expect([...legendLanguages({ python: 3, go: 5 })]).toEqual(['python']);
    expect(legendLanguages(undefined).size).toBe(0);
  });
});
