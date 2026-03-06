import { COLORS } from '../utils/colors';

const LEGEND_ITEMS = [
  { color: COLORS.directory, label: 'Directory', shape: 'diamond' },
  { color: COLORS.typescript, label: 'TypeScript', shape: 'circle' },
  { color: COLORS.javascript, label: 'JavaScript', shape: 'circle' },
  { color: COLORS.python, label: 'Python', shape: 'circle' },
  { color: COLORS.importEdge, label: 'Import', shape: 'line' },
  { color: COLORS.coChangeEdge, label: 'Co-change', shape: 'line' },
];

export function Legend() {
  return (
    <div className="fixed bottom-4 left-4 flex items-center gap-3 px-3 py-1.5 rounded-md text-[10px] select-none pointer-events-auto"
      style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}>
      {LEGEND_ITEMS.map(item => (
        <div key={item.label} className="flex items-center gap-1">
          {item.shape === 'diamond' ? (
            <div className="w-2 h-2 rotate-45" style={{ background: item.color }} />
          ) : item.shape === 'line' ? (
            <div className="w-3 h-px" style={{ background: item.color }} />
          ) : (
            <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          )}
          <span style={{ color: COLORS.textSecondary }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
