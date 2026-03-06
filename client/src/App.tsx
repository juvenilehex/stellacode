import { useEffect } from 'react';
import { Scene } from './three/Scene';
import { Sidebar } from './ui/Sidebar';
import { NodeDetail } from './ui/NodeDetail';
import { SearchBar } from './ui/SearchBar';
import { AgentPanel } from './ui/AgentPanel';
import { Legend } from './ui/Legend';
import { GitPanel } from './ui/GitPanel';
import { Breadcrumb } from './ui/Breadcrumb';
import { useGraphData } from './hooks/useGraphData';
import { useWebSocket } from './hooks/useWebSocket';
import { useGraphStore } from './store/graph-store';

export default function App() {
  useGraphData();
  useWebSocket();

  // ESC to deselect
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        useGraphStore.getState().selectNode(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-full h-full relative">
      {/* 3D Canvas */}
      <Scene />

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <SearchBar />
        <Breadcrumb />
        <Sidebar />
        <NodeDetail />
        <Legend />
        <GitPanel />
        <AgentPanel />
      </div>
    </div>
  );
}
