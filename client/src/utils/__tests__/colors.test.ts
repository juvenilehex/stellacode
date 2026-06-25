/**
 * getComplexityFactor 계약 테스트 (R263 자가발전).
 *
 * utils/colors.ts:getComplexityFactor는 노드 복잡도 글로우(시각화 크기/밝기)를 결정하는
 * 순수 함수이나 미테스트였다. 3개 상한 clamp(symbolCount/30·lineCount/500·degree/10) +
 * 가중합(0.4/0.3/0.3) + 최종 min(.,1)의 경계/분기를 [SPEC]으로 고정해 회귀를 막는다.
 * float 비교는 toBeCloseTo.
 */
import { describe, it, expect } from 'vitest';
import { getComplexityFactor } from '../colors';


describe('getComplexityFactor', () => {
  it('[SPEC] 전부 0이면 0', () => {
    expect(getComplexityFactor({ symbolCount: 0, lineCount: 0, degree: 0 })).toBeCloseTo(0);
  });

  it('[SPEC] undefined 필드는 0으로 취급(?? 0)', () => {
    expect(getComplexityFactor({})).toBeCloseTo(0);
  });

  it('[SPEC] 각 메트릭이 정확히 상한이면 합 1.0', () => {
    // symbols=1, lines=1, degree=1 → 1*0.4+1*0.3+1*0.3 = 1.0
    expect(getComplexityFactor({ symbolCount: 30, lineCount: 500, degree: 10 })).toBeCloseTo(1.0);
  });

  it('[SPEC] 상한 초과는 각 메트릭 1로 clamp → 합 1.0', () => {
    expect(getComplexityFactor({ symbolCount: 999, lineCount: 9999, degree: 999 })).toBeCloseTo(1.0);
  });

  it('[SPEC] 절반 입력 → 0.5 (가중치 합 1.0이므로)', () => {
    // symbols=0.5, lines=0.5, degree=0.5 → 0.5*(0.4+0.3+0.3) = 0.5
    expect(getComplexityFactor({ symbolCount: 15, lineCount: 250, degree: 5 })).toBeCloseTo(0.5);
  });

  it('[SPEC] symbolCount만 상한 → 0.4 (가중치)', () => {
    expect(getComplexityFactor({ symbolCount: 30, lineCount: 0, degree: 0 })).toBeCloseTo(0.4);
  });

  it('[SPEC] lineCount만 상한 → 0.3', () => {
    expect(getComplexityFactor({ symbolCount: 0, lineCount: 500, degree: 0 })).toBeCloseTo(0.3);
  });

  it('[SPEC] degree만 상한 → 0.3', () => {
    expect(getComplexityFactor({ symbolCount: 0, lineCount: 0, degree: 10 })).toBeCloseTo(0.3);
  });

  it('[현 동작] 음수는 floor되지 않음 (상한 clamp만) — count는 현실적으로 ≥0', () => {
    // characterization: 음수 입력은 음수 factor를 낸다(버그 fix 아님, 실데이터엔 음수 없음)
    expect(getComplexityFactor({ symbolCount: -30, lineCount: 0, degree: 0 })).toBeCloseTo(-0.4);
  });
});
