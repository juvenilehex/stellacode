import { describe, it, expect } from 'vitest';
import { judgeGraphQuality, verifyGraphIntegrity } from '../routes/quality.js';
import type { GraphData, GraphNode, GraphEdge, NodeMeta } from '../graph/types.js';

/**
 * quality.ts 계약 테스트 (R276 자가발전).
 *
 * judgeGraphQuality(L5 자율 품질판정)·verifyGraphIntegrity(L3 무결성검증)는 프로젝트의
 * 자기감시 코어이나 미테스트였다. 향후 리팩토링/임계 조정에 [SPEC] 불변식(임계·에스컬레이션·
 * 무결성 규칙)이 조용히 깨지지 않도록 고정한다. 순수 import 테스트(프로덕션 무변경).
 * ★정확값(timestamp 등)은 박제하지 않고 임계 경계·레벨·구조 불변식만 검증.
 */

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id, label: id, type: 'file',
    symbolCount: 1, lineCount: 10, size: 100,
    x: 0, y: 0, z: 0, degree: 0, scale: 1,
    ...overrides,
  };
}

function makeEdge(id: string, source: string, target: string, overrides: Partial<GraphEdge> = {}): GraphEdge {
  return { id, source, target, type: 'import', strength: 1, ...overrides };
}

function makeGraph(nodes: GraphNode[], edges: GraphEdge[] = []): GraphData {
  return {
    nodes, edges, rootDir: '/test', timestamp: 0,
    stats: { totalFiles: nodes.length, totalDirs: 0, totalSymbols: 0, totalEdges: edges.length, languages: {} },
  };
}

const island = (id: string): GraphNode => makeNode(id, { meta: { islandFile: true } as NodeMeta });

describe('judgeGraphQuality — parse-failure 임계 (R276)', () => {
  const clean = makeGraph([makeNode('a')]);

  it('[SPEC] 깨끗한 그래프(실패0·섬0·순환0) → passed=true, alerts 없음', () => {
    const r = judgeGraphQuality(clean, 10, 0);
    expect(r.passed).toBe(true);
    expect(r.alerts).toHaveLength(0);
    expect(r.timestamp).toEqual(expect.any(Number));
  });

  it('[SPEC] totalScanned=0(success+fail=0) → parse-failure 가드로 alert 없음', () => {
    const r = judgeGraphQuality(clean, 0, 0);
    expect(r.alerts.find(a => a.category === 'parse-failure')).toBeUndefined();
  });

  it('[SPEC] failureRate 정확히 0.1(1/10)은 strict >0.1이라 alert 아님', () => {
    const r = judgeGraphQuality(clean, 9, 1);
    expect(r.alerts.find(a => a.category === 'parse-failure')).toBeUndefined();
  });

  it('[SPEC] failureRate >0.1 ~ ≤0.3 → warning', () => {
    const r = judgeGraphQuality(clean, 8, 2); // 20%
    const a = r.alerts.find(x => x.category === 'parse-failure');
    expect(a).toBeDefined();
    expect(a!.level).toBe('warning');
    expect(r.passed).toBe(false);
  });

  it('[SPEC] failureRate >0.3 → critical', () => {
    const r = judgeGraphQuality(clean, 6, 4); // 40%
    const a = r.alerts.find(x => x.category === 'parse-failure');
    expect(a!.level).toBe('critical');
  });
});

describe('judgeGraphQuality — island/circular (R276)', () => {
  it('[SPEC] island 비율 >0.2 → warning + affectedNodes에 island id', () => {
    // file 노드 4개 중 island 2개 = 50% > 20%
    const g = makeGraph([island('i1'), island('i2'), makeNode('n1'), makeNode('n2')]);
    const r = judgeGraphQuality(g, 4, 0);
    const a = r.alerts.find(x => x.category === 'island-files');
    expect(a).toBeDefined();
    expect(a!.level).toBe('warning');
    expect(a!.affectedNodes).toEqual(expect.arrayContaining(['i1', 'i2']));
  });

  it('[SPEC] island 비율 ≤0.2 → alert 없음', () => {
    // file 5개 중 island 1개 = 20%, strict >0.2라 미발동
    const g = makeGraph([island('i1'), makeNode('n1'), makeNode('n2'), makeNode('n3'), makeNode('n4')]);
    const r = judgeGraphQuality(g, 5, 0);
    expect(r.alerts.find(x => x.category === 'island-files')).toBeUndefined();
  });

  it('[SPEC] file 노드 0개면 island 가드로 alert 없음', () => {
    const g = makeGraph([makeNode('d', { type: 'directory' })]);
    const r = judgeGraphQuality(g, 1, 0);
    expect(r.alerts.find(x => x.category === 'island-files')).toBeUndefined();
  });

  it('[SPEC] circular 라벨 엣지 → warning, metric=개수, affectedNodes=source∪target', () => {
    const g = makeGraph(
      [makeNode('a'), makeNode('b')],
      [makeEdge('e1', 'a', 'b', { label: 'circular dep' })],
    );
    const r = judgeGraphQuality(g, 2, 0);
    const a = r.alerts.find(x => x.category === 'circular-dependency');
    expect(a).toBeDefined();
    expect(a!.metric).toBe(1);
    expect(a!.affectedNodes).toEqual(expect.arrayContaining(['a', 'b']));
  });
});

describe('verifyGraphIntegrity (R276)', () => {
  it('[SPEC] 빈 노드 → valid=false, 0 nodes 에러', () => {
    const r = verifyGraphIntegrity(makeGraph([]));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('0 nodes'))).toBe(true);
  });

  it('[SPEC] 모든 엣지가 존재 노드 참조 → valid=true, errors 없음', () => {
    const g = makeGraph([makeNode('a'), makeNode('b')], [makeEdge('e1', 'a', 'b')]);
    const r = verifyGraphIntegrity(g);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.nodeCount).toBe(2);
    expect(r.edgeCount).toBe(1);
  });

  it('[SPEC] 미존재 source/target 참조 → 각각 에러', () => {
    const g = makeGraph([makeNode('a')], [makeEdge('e1', 'ghost', 'a'), makeEdge('e2', 'a', 'ghost2')]);
    const r = verifyGraphIntegrity(g);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('ghost'))).toBe(true);
    expect(r.errors.some(e => e.includes('ghost2'))).toBe(true);
  });

  it('[SPEC] 에러 20개 초과 → 앞 20개 + 요약 라인으로 캡', () => {
    const nodes = [makeNode('a')];
    // 25개 엣지가 모두 미존재 노드 참조 → source 에러 25개
    const edges = Array.from({ length: 25 }, (_, i) => makeEdge(`e${i}`, `ghost${i}`, 'a'));
    const r = verifyGraphIntegrity(makeGraph(nodes, edges));
    expect(r.errors).toHaveLength(21); // 20 + 요약 1
    expect(r.errors[20]).toContain('more errors');
  });
});
