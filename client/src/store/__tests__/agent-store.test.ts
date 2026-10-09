import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentStore, UNATTRIBUTED_AGENT } from '../agent-store';
import type { AgentEvent } from '../../types/agent';

const ev = (id: string, agent: string, filePath = 'src/a.ts'): AgentEvent =>
  ({ id, timestamp: Date.now(), type: 'file_edit', agent, filePath });

describe('agent-store — 출처 미상 변경은 에이전트 활동이 아니다 (R624)', () => {
  beforeEach(() => useAgentStore.setState({ events: [], unattributed: [], activeFiles: new Map() }));

  it('파일 감시 이벤트는 별도 버퍼로 가고 카운터·궤적·발광에 안 들어간다', () => {
    useAgentStore.getState().addEvent(ev('w1', UNATTRIBUTED_AGENT));
    const s = useAgentStore.getState();
    expect(s.events).toHaveLength(0);
    expect(s.unattributed).toHaveLength(1);
    expect(s.isFileActive('src/a.ts')).toBe(false);
  });

  it('귀속 이벤트는 events 와 발광에 들어간다', () => {
    useAgentStore.getState().addEvent(ev('c1', 'claude-code'));
    const s = useAgentStore.getState();
    expect(s.events.map(e => e.id)).toEqual(['c1']);
    expect(s.isFileActive('src/a.ts')).toBe(true);
  });

  it('출처 미상 이벤트가 몰려도 귀속 이벤트를 밀어내지 않는다', () => {
    useAgentStore.getState().addEvent(ev('c1', 'claude-code'));
    for (let i = 0; i < 500; i++) useAgentStore.getState().addEvent(ev(`w${i}`, UNATTRIBUTED_AGENT, `f${i}.ts`));
    expect(useAgentStore.getState().events.map(e => e.id)).toEqual(['c1']);
  });
});
