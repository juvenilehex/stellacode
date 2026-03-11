import { useState, useEffect, useCallback } from 'react';
import { Scene } from './three/Scene';
import { Sidebar } from './ui/Sidebar';
import { NodeDetail } from './ui/NodeDetail';
import { SearchBar } from './ui/SearchBar';
import { AgentPanel } from './ui/AgentPanel';
import { Legend } from './ui/Legend';
import { HoverTooltip } from './ui/HoverTooltip';
import { GitPanel } from './ui/GitPanel';
import { Breadcrumb } from './ui/Breadcrumb';
import { Toolbar } from './ui/Toolbar';
import { TimelineSlider } from './ui/TimelineSlider';
import { ConnectScreen } from './ui/ConnectScreen';
import { DraggablePanel } from './ui/DraggablePanel';
import { useGraphData } from './hooks/useGraphData';
import { useWebSocket } from './hooks/useWebSocket';
import { useGraphStore } from './store/graph-store';
import { useSettingsStore } from './store/settings-store';
import { useTimelineStore } from './store/timeline-store';

export default function App() {
  const [connected, setConnected] = useState(false);

  if (connected) return <Observatory />;

  return <ConnectScreen onConnected={() => setConnected(true)} />;
}

function Observatory() {
  useGraphData();
  useWebSocket();

  const panels = useSettingsStore(s => s.panels);
  const fontSize = useSettingsStore(s => s.fontSize);
  const observeMode = useSettingsStore(s => s.observeMode);
  const setObserveMode = useSettingsStore(s => s.setObserveMode);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      if (e.key === 'Escape') {
        // Timeline handles its own Escape
        if (useTimelineStore.getState().mode === 'replay') return;
        if (useSettingsStore.getState().observeMode) {
          useSettingsStore.getState().setObserveMode(false);
        } else {
          useGraphStore.getState().selectNode(null);
        }
      }

      // Ctrl/Cmd+F: focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Search files..."]');
        if (searchInput) searchInput.focus();
      }

      // Skip single-key shortcuts during timeline replay (has its own keybinds)
      if (useTimelineStore.getState().mode === 'replay') return;

      // O: toggle observe mode
      if (e.key === 'o' && !e.ctrlKey && !e.metaKey) {
        useSettingsStore.getState().setObserveMode(!useSettingsStore.getState().observeMode);
      }

      // L: cycle label mode
      if (e.key === 'l' && !e.ctrlKey && !e.metaKey) {
        useSettingsStore.getState().cycleLabelMode();
      }

      // 1/2/3: color mode
      if (e.key === '1') useSettingsStore.getState().setColorMode('language');
      if (e.key === '2') useSettingsStore.getState().setColorMode('age');
      if (e.key === '3') useSettingsStore.getState().setColorMode('agent');
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const exitObserve = useCallback(() => {
    if (observeMode) setObserveMode(false);
  }, [observeMode, setObserveMode]);

  return (
    <div className="w-full h-full relative" style={{ fontSize }}>
      <Scene />

      {/* Observe mode: click anywhere to exit */}
      {observeMode && (
        <div
          className="absolute inset-0 z-30 cursor-pointer"
          onClick={exitObserve}
        />
      )}

      {/* UI overlay — fades out in observe mode */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
        style={{ opacity: observeMode ? 0 : 1, pointerEvents: observeMode ? 'none' : undefined }}
      >
        <Toolbar />

        <DraggablePanel
          visible={panels.search}
          defaultStyle={{ top: 16, left: '50%', marginLeft: -132 }}
        >
          <SearchBar />
        </DraggablePanel>

        <DraggablePanel
          visible={panels.breadcrumb}
          defaultStyle={{ top: 56, left: '50%', marginLeft: -160 }}
        >
          <Breadcrumb />
        </DraggablePanel>

        <Sidebar />

        <DraggablePanel
          visible={panels.nodeDetail}
          defaultStyle={{ top: 48, right: 16 }}
          resizable
          minWidth={240}
          minHeight={120}
        >
          <NodeDetail />
        </DraggablePanel>

        <DraggablePanel
          visible={panels.legend}
          defaultStyle={{ bottom: 16, left: 16 }}
        >
          <Legend />
        </DraggablePanel>

        <DraggablePanel
          visible={panels.gitPanel}
          defaultStyle={{ bottom: 52, left: '50%', marginLeft: -192 }}
        >
          <GitPanel />
        </DraggablePanel>

        <DraggablePanel
          visible={panels.activity}
          defaultStyle={{ bottom: 16, right: 16 }}
          resizable
          minWidth={200}
          minHeight={80}
        >
          <AgentPanel />
        </DraggablePanel>

        <HoverTooltip />
      </div>

      {/* Timeline scrub bar (visible in replay mode) */}
      <TimelineSlider />

      {/* Observe mode: gentle hint overlay */}
      {observeMode && <ObserveOverlay />}
    </div>
  );
}

/** Overlay shown during observe mode — fades after a few seconds */
function ObserveOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-x-0 bottom-8 z-50 flex flex-col items-center gap-2 pointer-events-none transition-opacity duration-1000"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <p
        className="text-[11px] tracking-[0.2em]"
        style={{ color: 'rgba(200, 180, 140, 0.5)' }}
      >
        watching the stars
      </p>
      <p
        className="text-[9px] tracking-[0.15em]"
        style={{ color: 'rgba(180, 170, 150, 0.3)' }}
      >
        click anywhere or press ESC to return
      </p>
    </div>
  );
}
