import { create } from 'zustand';
import { CONFIG } from '../utils/config';
import type { AgentEvent, AgentSession } from '../types/agent';

/** Files currently being touched by a live agent, with expiry */
type ActiveFiles = Map<string, number>;

/**
 * 파일 감시(fs watch) 이벤트의 agent 값. OS 파일 이벤트는 바꾼 프로세스를 주지 않아 귀속할 수 없다
 * (server/src/agent/tracker.ts trackFileChange). 사람의 저장도, 에이전트의 저장도 이 값으로 온다.
 */
export const UNATTRIBUTED_AGENT = 'unknown';

interface AgentState {
  /** 에이전트에 귀속된 이벤트만(지금은 live-watcher 의 claude-code). 카운터·궤적·발광이 읽는다 */
  events: AgentEvent[];
  /**
   * 출처 미상 파일 변경. 별도 버퍼 — 한 버퍼에 섞으면 checkout·빌드처럼 저장이 몰릴 때 상한(maxStoredEvents)을
   * 이것이 채워 귀속 이벤트를 밀어낸다. Claude 가 저장한 파일도 여기 한 건 더 들어온다(중복 제거는 경로·시각만으로
   * '같은 편집'과 'Claude 직후 사람 저장'을 못 가려 하지 않는다 — R624 판정).
   */
  unattributed: AgentEvent[];
  sessions: AgentSession[];
  isTracking: boolean;
  panelOpen: boolean;
  /** File paths actively being worked on (relative path -> timestamp) */
  activeFiles: ActiveFiles;

  addEvent: (event: AgentEvent) => void;
  setEvents: (events: AgentEvent[]) => void;
  setSessions: (sessions: AgentSession[]) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  isFileActive: (filePath: string) => boolean;
}

/** How long (ms) a file stays "active" after the last agent touch */
const ACTIVE_TTL = 8_000;

export const useAgentStore = create<AgentState>((set, get) => ({
  events: [],
  unattributed: [],
  sessions: [],
  isTracking: false,
  panelOpen: false,
  activeFiles: new Map(),

  addEvent: (event) => set((state) => {
    // R624: 출처 미상 변경은 'Agent Activity'·궤적·발광에 넣지 않는다 — 종전엔 사람 저장이 Claude 색 카운터와
    // 'AI 에이전트 궤적'으로 그려졌다.
    if (event.agent === UNATTRIBUTED_AGENT) {
      return { unattributed: [event, ...state.unattributed].slice(0, CONFIG.agent.maxStoredEvents) };
    }
    const activeFiles = new Map(state.activeFiles);

    // Mark file as active if it has a file path
    if (event.filePath) {
      activeFiles.set(event.filePath, Date.now());
      // Expire old entries
      const now = Date.now();
      for (const [key, ts] of activeFiles) {
        if (now - ts > ACTIVE_TTL) activeFiles.delete(key);
      }
    }

    return {
      events: [event, ...state.events].slice(0, CONFIG.agent.maxStoredEvents),
      isTracking: true,
      activeFiles,
    };
  }),

  setEvents: (events) => set({ events }),
  setSessions: (sessions) => set({ sessions, isTracking: sessions.length > 0 }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  setPanelOpen: (open) => set({ panelOpen: open }),

  isFileActive: (filePath: string) => {
    const ts = get().activeFiles.get(filePath);
    if (!ts) return false;
    return Date.now() - ts < ACTIVE_TTL;
  },
}));
