import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../settings-store';

/**
 * settings-store resetColors 회귀 테스트 (R238 자가발전).
 *
 * R231 수정: initial state의 edgeStyles와 resetColors()가 서로 다른 값으로 drift해
 * "Reset"이 초기상태로 복원되지 않던 버그를, DEFAULT_EDGE_STYLES 단일 상수를
 * initial/reset이 공유하도록 통일했다. 그 통일이 조용히 깨지지(다시 drift) 않도록
 * [SPEC] 계약을 고정한다.
 *
 * ★canonical edge 기본값(R231 통일 기준): import 10 / directory 20 / coChange 15.
 *   재튜닝 시 DEFAULT_EDGE_STYLES와 함께 이 baseline도 갱신.
 */

describe('settings-store resetColors (R231 drift 회귀)', () => {
  beforeEach(() => {
    // 각 테스트 전 깨끗한 상태로 (resetColors가 DEFAULT_EDGE_STYLES로 복원)
    useSettingsStore.getState().resetColors();
  });

  it('[SPEC][R231] resetColors는 canonical 기본 edgeStyles로 복원 (initial과 동일)', () => {
    const { edgeStyles } = useSettingsStore.getState();
    expect(edgeStyles.importEdge).toEqual({ weight: 1, opacity: 10 });
    expect(edgeStyles.directoryEdge).toEqual({ weight: 1, opacity: 20 });
    expect(edgeStyles.coChangeEdge).toEqual({ weight: 1, opacity: 15 });
  });

  it('[SPEC] setEdgeStyle 변경 후 resetColors가 기본값 복원', () => {
    useSettingsStore.getState().setEdgeStyle('importEdge', { weight: 5, opacity: 99 });
    expect(useSettingsStore.getState().edgeStyles.importEdge).toEqual({ weight: 5, opacity: 99 });

    useSettingsStore.getState().resetColors();
    expect(useSettingsStore.getState().edgeStyles.importEdge).toEqual({ weight: 1, opacity: 10 });
  });

  it('[SPEC] setEdgeStyle은 다른 키에 영향 없음 (불변 갱신)', () => {
    useSettingsStore.getState().setEdgeStyle('importEdge', { opacity: 77 });
    const { edgeStyles } = useSettingsStore.getState();
    expect(edgeStyles.importEdge.opacity).toBe(77);
    // 나머지 키는 기본값 유지
    expect(edgeStyles.directoryEdge).toEqual({ weight: 1, opacity: 20 });
    expect(edgeStyles.coChangeEdge).toEqual({ weight: 1, opacity: 15 });
  });

  it('[SPEC] resetColors 후 변경이 다음 reset 결과를 오염시키지 않음 (공유 ref 누수 없음)', () => {
    useSettingsStore.getState().resetColors();
    useSettingsStore.getState().setEdgeStyle('coChangeEdge', { opacity: 1 });
    useSettingsStore.getState().resetColors();
    // 두 번째 reset도 깨끗한 기본값이어야 (DEFAULT_EDGE_STYLES가 in-place mutate 안 됨)
    expect(useSettingsStore.getState().edgeStyles.coChangeEdge).toEqual({ weight: 1, opacity: 15 });
  });
});
