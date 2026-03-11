import { useState } from 'react';
import { useGraphStore } from '../store/graph-store';
import { COLORS } from '../utils/colors';
import { AboutModal } from './AboutModal';

export function Sidebar() {
  const data = useGraphStore(s => s.data);
  const loading = useGraphStore(s => s.loading);
  const error = useGraphStore(s => s.error);
  const [aboutOpen, setAboutOpen] = useState(false);

  if (loading) {
    return (
      <div className="fixed top-4 left-4 px-4 py-3 rounded-lg text-sm"
        style={{ background: COLORS.panelBg, borderColor: COLORS.panelBorder, borderWidth: 1 }}>
        <div className="animate-pulse" style={{ color: COLORS.textSecondary }}>
          Scanning project...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed top-4 left-4 px-4 py-3 rounded-lg text-sm"
        style={{ background: COLORS.panelBg, borderColor: 'rgba(255,100,100,0.3)', borderWidth: 1 }}>
        <div style={{ color: '#ff6464' }}>Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const { stats } = data;

  return (
    <div className="fixed top-4 left-4 w-56 rounded-lg text-xs select-none pointer-events-auto"
      style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}>
      {/* Header */}
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: COLORS.textPrimary }}>
            StellaCode
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(199,164,255,0.1)', color: COLORS.directory }}>
            v1.0
          </span>
          <button
            onClick={() => setAboutOpen(true)}
            className="ml-auto text-[10px] w-4 h-4 rounded flex items-center justify-center hover:opacity-70"
            style={{ border: `1px solid ${COLORS.panelBorder}`, color: COLORS.textSecondary }}
          >
            ?
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 py-2 space-y-1.5">
        <StatRow label="Files" value={stats.totalFiles} />
        <StatRow label="Directories" value={stats.totalDirs} />
        <StatRow label="Symbols" value={stats.totalSymbols} />
        <StatRow label="Connections" value={stats.totalEdges} />

        {/* Languages */}
        <div className="pt-1.5" style={{ borderTop: `1px solid ${COLORS.panelBorder}` }}>
          <div style={{ color: COLORS.textSecondary }} className="mb-1">Languages</div>
          {Object.entries(stats.languages).map(([lang, count]) => (
            <div key={lang} className="flex justify-between">
              <span style={{ color: COLORS.textSecondary }}>{lang}</span>
              <span style={{ color: COLORS.textPrimary }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="px-3 py-2 space-y-0.5" style={{ borderTop: `1px solid ${COLORS.panelBorder}` }}>
        <div style={{ color: COLORS.textSecondary }}>
          Click node to focus | ESC to reset
        </div>
        <div style={{ color: COLORS.textSecondary }}>
          Scroll to zoom | Drag to rotate
        </div>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: COLORS.textSecondary }}>{label}</span>
      <span style={{ color: COLORS.textPrimary }} className="font-mono">{value}</span>
    </div>
  );
}
