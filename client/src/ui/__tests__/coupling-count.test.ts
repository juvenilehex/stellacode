/**
 * 커플링 수는 한 정의다 (R639, merge_candidates L304).
 * 배지가 /api/git/stats 의 coChanges 길이(500커밋·전 파일)를 세서 "50"이라 하고
 * 화면의 co-change 선은 34개였다. 배지는 그려진 선을 센다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { couplingCounts, couplingBadgeTitle } from '../GitPanel';

describe('커플링 수 단일 정의', () => {
  const coChanges = [
    { fileA: 'a.ts', fileB: 'b.ts' },
    { fileA: 'a.ts', fileB: 'README.md' },
    { fileA: 'c.ts', fileB: 'd.ts' },
  ];
  const edges = [
    { type: 'import' as const },
    { type: 'co-change' as const },
    { type: 'co-change' as const },
    { type: 'directory' as const },
  ];

  it('배지 수 = 그래프에 그려진 co-change 선 수', () => {
    expect(couplingCounts(coChanges, edges)).toEqual({ drawn: 2, listed: 3 });
  });

  it('둘이 다르면 툴팁이 차이를 말하고, import 를 뺐다고 주장하지 않는다', () => {
    const t = couplingBadgeTitle({ drawn: 34, listed: 50 });
    expect(t).toMatch(/^34 /);
    expect(t).toContain('50');
    expect(t).not.toMatch(/without imports/);
  });

  it('배지가 coChanges 길이를 직접 세지 않는다', () => {
    const src = readFileSync(join(__dirname, '..', 'GitPanel.tsx'), 'utf-8');
    expect(src).not.toMatch(/couplingCount\s*=\s*stats\.coChanges/);
  });
});
