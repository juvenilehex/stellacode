/**
 * nodeRules 계약 테스트 (R559 결합).
 *
 * ConstellationNode(<=100 노드)와 InstancedNodes(>100 노드)가 각자 사본으로 갖던 규칙을
 * three/nodeRules.ts 하나로 모았다. 사본 시절의 식을 [SPEC]으로 고정해, 임계값 양쪽에서
 * 같은 프로젝트가 다르게 보이는 표류가 다시 생기지 않게 한다.
 */
import { describe, it, expect } from 'vitest';
import {
  getNodePhase, getNodeBaseScale, getNodeRevealT, getEdgeRevealT, getEntryScale, getAgentPulse, motionSin,
} from '../nodeRules';

describe('getNodeBaseScale', () => {
  it('[SPEC] 디렉터리는 0.28 × sizeScale', () => {
    expect(getNodeBaseScale('directory', 5, 1)).toBeCloseTo(0.28);
    expect(getNodeBaseScale('directory', 5, 2)).toBeCloseTo(0.56);
  });
  it('[SPEC] 파일은 (0.14 + scale×0.09) × sizeScale', () => {
    expect(getNodeBaseScale('file', 1, 1)).toBeCloseTo(0.23);
    expect(getNodeBaseScale('file', 2, 0.5)).toBeCloseTo(0.16);
  });
});

describe('getNodePhase', () => {
  it('[SPEC] x×1.7 + y×2.3 + z×0.9', () => {
    expect(getNodePhase(1, 1, 1)).toBeCloseTo(4.9);
    expect(getNodePhase(0, 0, 0)).toBe(0);
  });
});

describe('getNodeRevealT', () => {
  it('[SPEC] (x×0.3 + y×0.5 + z×0.2 + 10) / 20', () => {
    expect(getNodeRevealT(0, 0, 0)).toBeCloseTo(0.5);
    expect(getNodeRevealT(10, 0, 0)).toBeCloseTo(0.65);
  });
  it('[SPEC] 0~1 로 clamp', () => {
    expect(getNodeRevealT(-100, -100, -100)).toBe(0);
    expect(getNodeRevealT(100, 100, 100)).toBe(1);
  });
});

describe('getEdgeRevealT', () => {
  it('[SPEC] 두 끝 노드 중 늦은 쪽 + 0.05 (clamp 바깥에서 더한다)', () => {
    const a = { x: 0, y: 0, z: 0 };       // 0.5
    const b = { x: 10, y: 0, z: 0 };      // 0.65
    expect(getEdgeRevealT(a, b)).toBeCloseTo(0.7);
    const far = { x: 100, y: 100, z: 100 }; // clamp 1
    expect(getEdgeRevealT(a, far)).toBeCloseTo(1.05);
  });
});

describe('getEntryScale', () => {
  it('[SPEC] 아직 드러나기 전이면 0', () => {
    expect(getEntryScale(0.4, 0.5)).toBe(0);
    expect(getEntryScale(0.5, 0.5)).toBe(0);
  });
  it('[SPEC] 드러나는 중에는 overshoot(×1.3), 끝나면 1', () => {
    // reveal = (0.53-0.5)/0.15 = 0.2 → 0.2×1.8×1.3
    expect(getEntryScale(0.53, 0.5)).toBeCloseTo(0.468);
    expect(getEntryScale(1, 0.5)).toBeCloseTo(1);
  });
});

describe('getAgentPulse', () => {
  it('[SPEC] 동작 줄이기면 시간과 무관하게 1.3 고정', () => {
    expect(getAgentPulse(0, 0, 1, true)).toBe(1.3);
    expect(getAgentPulse(12.3, 4.5, 2, true)).toBe(1.3);
  });
  it('[SPEC] 그 외에는 1 + (0.15+0.25·sig) + sin(8t+phase)·(0.15+0.15·sig)', () => {
    expect(getAgentPulse(0, 0, 1, false)).toBeCloseTo(1.4);
    expect(getAgentPulse(0, Math.PI / 2, 1, false)).toBeCloseTo(1.7);
  });
});

describe('motionSin', () => {
  it('[SPEC] 동작 줄이기면 0, 아니면 Math.sin', () => {
    expect(motionSin(true, Math.PI / 2)).toBe(0);
    expect(motionSin(false, Math.PI / 2)).toBeCloseTo(1);
  });
});
