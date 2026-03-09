import { create } from 'zustand';
import { CONFIG } from '../utils/config';
import type { AgentEvent, AgentSession } from '../types/agent';

/** Files currently being touched by a live agent, with expiry */
type ActiveFiles = Map<string, number>;

interface AgentState {
  events: AgentEvent[];
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
  sessions: [],
  isTracking: false,
  panelOpen: false,
  activeFiles: new Map(),

  addEvent: (event) => set((state) => {
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
