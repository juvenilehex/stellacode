import { useState } from 'react';
import { useGraphStore } from '../store/graph-store';
import { COLORS } from '../utils/colors';
import { useThemeColors } from '../hooks/useThemeColors';
import { AboutModal } from './AboutModal';

export function Sidebar() {
  const data = useGraphStore(s => s.data);
  const loading = useGraphStore(s => s.loading);
  const error = useGraphStore(s => s.error);
  const [aboutOpen, setAboutOpen] = useState(false);
  const C = useThemeColors();

  if (loading) {
    return (
      <div className="fixed top-4 left-4 px-4 py-3 rounded-lg text-sm"
        style={{ background: C.panelBg, borderColor: C.panelBorder, borderWidth: 1 }}>
        <div className="animate-pulse" style={{ color: C.textSecondary }}>
          Scanning project...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed top-4 left-4 px-4 py-3 rounded-lg text-sm"
        style={{ background: C.panelBg, borderColor: 'rgba(255,100,100,0.3)', borderWidth: 1 }}>
        <div style={{ color: '#ff6464' }}>Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { stats } = data;

  return (
    <div className="fixed top-4 left-4 w-56 rounded-lg text-xs select-none pointer-events-auto"
      style={{ background: C.panelBg, border: `1px solid ${C.panelBorder}` }}>
      {/* Header */}
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${C.panelBorder}` }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: C.textPrimary }}>
            StellaCode
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(199,164,255,0.1)', color: C.directory }}>
            v1.0
          </span>
          <button
            onClick={() => setAboutOpen(true)}
            className="ml-auto text-[10px] w-4 h-4 rounded flex items-center justify-center hover:opacity-70"
            style={{ border: `1px solid ${C.panelBorder}`, color: C.textSecondary }}
          >
            ?
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 py-2 space-y-1.5">
        <StatRow label="Files" value={stats.totalFiles} tc={C} />
        <StatRow label="Directories" value={stats.totalDirs} tc={C} />
        <StatRow label="Symbols" value={stats.totalSymbols} tc={C} />
        <StatRow label="Connections" value={stats.totalEdges} tc={C} />

        {/* Languages */}
        <div className="pt-1.5" style={{ borderTop: `1px solid ${C.panelBorder}` }}>
          <div style={{ color: C.textSecondary }} className="mb-1">Languages</div>
          {Object.entries(stats.languages).map(([lang, count]) => (
            <div key={lang} className="flex justify-between">
              <span style={{ color: C.textSecondary }}>{lang}</span>
              <span style={{ color: C.textPrimary }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="px-3 py-2 space-y-0.5" style={{ borderTop: `1px solid ${C.panelBorder}` }}>
        <div style={{ color: C.textSecondary }}>
          Click node to focus | ESC to reset
        </div>
        <div style={{ color: C.textSecondary }}>
          Scroll to zoom | Drag to rotate
        </div>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

function StatRow({ label, value, tc }: { label: string; value: number; tc: { textPrimary: string; textSecondary: string } }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: tc.textSecondary }}>{label}</span>
      <span style={{ color: tc.textPrimary }} className="font-mono">{value}</span>
    </div>
  );
}
