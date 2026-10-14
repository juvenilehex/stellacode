/**
 * 커플링 수는 한 정의다 (R639, merge_candidates L304).
 * 배지가 /api/git/stats 의 coChanges 길이(500커밋·전 파일)를 세서 "50"이라 하고
 * 화면의 co-change 선은 34개였다. 배지는 그려진 선을 센다.
 * R657: 목록의 쌍마다 그래프가 말하는 상태(숨은 결합 / import 도 있음 / 그래프에 없음)를 가른다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { couplingCounts, couplingBadgeTitle, coChangeStatuses } from '../GitPanel';

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
