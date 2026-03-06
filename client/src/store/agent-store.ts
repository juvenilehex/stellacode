import { create } from 'zustand';
import { CONFIG } from '../utils/config';
import type { AgentEvent, AgentSession } from '../types/agent';

interface AgentState {
  events: AgentEvent[];
  sessions: AgentSession[];
  isTracking: boolean;
  panelOpen: boolean;

  addEvent: (event: AgentEvent) => void;
  setEvents: (events: AgentEvent[]) => void;
  setSessions: (sessions: AgentSession[]) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  events: [],
  sessions: [],
  isTracking: false,
  panelOpen: false,

  addEvent: (event) => set((state) => ({
    events: [event, ...state.events].slice(0, CONFIG.agent.maxStoredEvents),
  })),

  setEvents: (events) => set({ events }),
  setSessions: (sessions) => set({ sessions, isTracking: sessions.length > 0 }),
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  setPanelOpen: (open) => set({ panelOpen: open }),
}));
