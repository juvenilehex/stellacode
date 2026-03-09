import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { COLORS } from '../utils/colors';

/** Which UI panels are visible */
export interface UIPanelVisibility {
  legend: boolean;
  activity: boolean;
  search: boolean;
  gitPanel: boolean;
  nodeDetail: boolean;
  breadcrumb: boolean;
}

/** Customizable colors keyed by legend/node type */
export interface CustomColors {
  directory: string;
  typescript: string;
  javascript: string;
  python: string;
  unknown: string;
  importEdge: string;
  directoryEdge: string;
  coChangeEdge: string;
}

/** Per-edge-type line style */
export interface EdgeStyle {
  weight: number;   // 1-5, line thickness multiplier
  opacity: number;  // 0-100, base opacity percentage
}

export type EdgeStyleKey = 'importEdge' | 'directoryEdge' | 'coChangeEdge';

/** Per-node-type visual style */
export interface NodeStyle {
  opacity: number;  // 10-100, base opacity percentage
  size: number;     // 50-200, scale percentage
}

export type NodeStyleKey = 'directory' | 'typescript' | 'javascript' | 'python' | 'unknown';

interface SettingsState {
  panels: UIPanelVisibility;
  colors: CustomColors;
  edgeStyles: Record<EdgeStyleKey, EdgeStyle>;
  nodeStyles: Record<NodeStyleKey, NodeStyle>;
  fontSize: number;         // 10-18, base UI font size
  signalIntensity: number;  // 1-100, agent pulse visibility
  bloomIntensity: number;   // 0-100, bloom strength
  /** File label display: 'all' | 'selected' | 'off' */
  labelMode: 'all' | 'selected' | 'off';
  /** Observe mode — contemplative stargazing */
  observeMode: boolean;

  togglePanel: (key: keyof UIPanelVisibility) => void;
  setColor: (key: keyof CustomColors, value: string) => void;
  setEdgeStyle: (key: EdgeStyleKey, style: Partial<EdgeStyle>) => void;
  setNodeStyle: (key: NodeStyleKey, style: Partial<NodeStyle>) => void;
  resetColors: () => void;
  setFontSize: (size: number) => void;
  setSignalIntensity: (value: number) => void;
  setBloomIntensity: (value: number) => void;
  cycleLabelMode: () => void;
  setObserveMode: (on: boolean) => void;
}

const DEFAULT_COLORS: CustomColors = {
  directory: COLORS.directory,
  typescript: COLORS.typescript,
  javascript: COLORS.javascript,
  python: COLORS.python,
  unknown: COLORS.unknown,
  importEdge: COLORS.importEdge,
  directoryEdge: COLORS.directoryEdge,
  coChangeEdge: COLORS.coChangeEdge,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      panels: {
        legend: true,
        activity: true,
        search: true,
        gitPanel: true,
        nodeDetail: true,
        breadcrumb: true,
      },
      colors: { ...DEFAULT_COLORS },
      edgeStyles: {
        importEdge:    { weight: 1, opacity: 30 },
        directoryEdge: { weight: 1, opacity: 15 },
        coChangeEdge:  { weight: 1, opacity: 45 },
      },
      nodeStyles: {
        directory:  { opacity: 70, size: 100 },
        typescript: { opacity: 70, size: 100 },
        javascript: { opacity: 70, size: 100 },
        python:     { opacity: 70, size: 100 },
        unknown:    { opacity: 70, size: 100 },
      },
      fontSize: 12,
      signalIntensity: 25,
      bloomIntensity: 60,
      labelMode: 'selected' as const,
      observeMode: false,

      togglePanel: (key) => set((s) => ({
        panels: { ...s.panels, [key]: !s.panels[key] },
      })),

      setColor: (key, value) => set((s) => ({
        colors: { ...s.colors, [key]: value },
      })),

      setEdgeStyle: (key, style) => set((s) => ({
        edgeStyles: {
          ...s.edgeStyles,
          [key]: { ...s.edgeStyles[key], ...style },
        },
      })),

      setNodeStyle: (key, style) => set((s) => ({
        nodeStyles: {
          ...s.nodeStyles,
          [key]: { ...s.nodeStyles[key], ...style },
        },
      })),

      resetColors: () => set({
        colors: { ...DEFAULT_COLORS },
        edgeStyles: {
          importEdge:    { weight: 1, opacity: 30 },
          directoryEdge: { weight: 1, opacity: 15 },
          coChangeEdge:  { weight: 1, opacity: 45 },
        },
        nodeStyles: {
          directory:  { opacity: 70, size: 100 },
          typescript: { opacity: 70, size: 100 },
          javascript: { opacity: 70, size: 100 },
          python:     { opacity: 70, size: 100 },
          unknown:    { opacity: 70, size: 100 },
        },
      }),

      setFontSize: (size) => set({ fontSize: Math.max(9, Math.min(18, size)) }),
      setSignalIntensity: (value) => set({ signalIntensity: Math.max(1, Math.min(100, value)) }),
      setBloomIntensity: (value) => set({ bloomIntensity: Math.max(0, Math.min(100, value)) }),
      cycleLabelMode: () => set((s) => {
        const order: Array<'all' | 'selected' | 'off'> = ['all', 'selected', 'off'];
        const idx = order.indexOf(s.labelMode);
        return { labelMode: order[(idx + 1) % 3] };
      }),
      setObserveMode: (on) => set({ observeMode: on }),
    }),
    { name: 'stellacode-settings' },
  ),
);
