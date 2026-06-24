import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore, type TimelineCommit } from '../timeline-store';
import { useGraphStore } from '../graph-store';
import type { GraphData, GraphNode } from '../../types/graph';

/**
 * timeline-store scrubTo의 디렉토리 노드 표시 로직 회귀 테스트 (R237 자가발전).
 *
 * R231 수정: 디렉토리 prefix 매칭이 f.startsWith(dirPrefix)로 경계가 없어
 * 'src'가 'src-utils/...'를 오매칭하던 버그를 f === dirPrefix || startsWith(dirPrefix + '/')로
 * 고쳤다. 그 수정이 조용히 회귀하지 않도록 [SPEC] 경계 계약을 고정한다.
 */

function makeNode(id: string, type: GraphNode['type'] = 'file'): GraphNode {
  return {
    id, label: id, type, language: 'typescript',
    symbolCount: 1, lineCount: 10, size: 100,
    x: 0, y: 0, z: 0, degree: 0, scale: 1,
  };
}

function makeGraph(nodes: GraphNode[]): GraphData {
  return {
    nodes, edges: [], rootDir: '/test', timestamp: 0,
    stats: { totalFiles: 0, totalDirs: 0, totalSymbols: 0, totalEdges: 0, languages: {} },
  };
}

function makeCommit(): TimelineCommit {
  return {
    hash: 'h0', shortHash: 'h0', timestamp: 0, message: 'm', author: 'a',
    isAgent: false, conventionalType: 'feat', fileStatuses: [],
  };
}

/** snapshot으로 visible 파일을 직접 주입하고 scrubTo(0) 실행 → graph-store의 visible nodeIds 반환 */
function scrubWithVisible(files: string[]): Set<string> | null {
  useTimelineStore.setState({
    commits: [makeCommit()],
    snapshots: new Map([[0, new Set(files)]]),
    mode: 'replay',
    loaded: true,
  });
  useTimelineStore.getState().scrubTo(0);
  return useGraphStore.getState().timelineVisibleIds;
}

describe('timeline-store scrubTo 디렉토리 prefix 경계 (R231 회귀)', () => {
  beforeEach(() => {
    // dir:src 디렉토리 노드 하나만 둠
    useGraphStore.getState().setData(makeGraph([makeNode('dir:src', 'directory')]));
  });

  it('[SPEC] src/ 하위 파일이 보이면 dir:src 포함', () => {
    const ids = scrubWithVisible(['src/App.tsx']);
    expect(ids?.has('dir:src')).toBe(true);
  });

  it('[SPEC][R231] src-utils/ 파일만 보이면 dir:src 미포함 (경계 오매칭 금지)', () => {
    const ids = scrubWithVisible(['src-utils/x.ts']);
    // 수정 전 버그: "src-utils/x.ts".startsWith("src") === true → dir:src 잘못 포함
    expect(ids?.has('dir:src')).toBe(false);
  });

  it('[SPEC] 정확히 디렉토리명(src) 자체가 보이면 dir:src 포함', () => {
    const ids = scrubWithVisible(['src']);
    expect(ids?.has('dir:src')).toBe(true);
  });

  it('[SPEC] 보이는 파일이 file: 노드로도 매핑된다', () => {
    const ids = scrubWithVisible(['src/App.tsx']);
    expect(ids?.has('file:src/App.tsx')).toBe(true);
  });
});
