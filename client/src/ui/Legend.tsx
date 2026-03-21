import { COLORS } from '../utils/colors';
import { useThemeColors } from '../hooks/useThemeColors';
import { useGraphStore } from '../store/graph-store';
import { useSettingsStore } from '../store/settings-store';
import type { FilterKey } from '../store/graph-store';

const LEGEND_ITEMS: { key: FilterKey; color: string; label: string; shape: 'diamond' | 'circle' | 'line' | 'dotted' }[] = [
  { key: 'directory', color: COLORS.directory, label: 'Directory', shape: 'diamond' },
  { key: 'typescript', color: COLORS.typescript, label: 'TypeScript', shape: 'circle' },
  { key: 'javascript', color: COLORS.javascript, label: 'JavaScript', shape: 'circle' },
  { key: 'python', color: COLORS.python, label: 'Python', shape: 'circle' },
  { key: 'dir-edge', color: COLORS.directoryEdge, label: 'Structure', shape: 'line' },
  { key: 'import', color: COLORS.importEdge, label: 'Import', shape: 'line' },
  { key: 'co-change', color: COLORS.coChangeEdge, label: 'Co-change', shape: 'dotted' },
];

const LABEL_MODE_DISPLAY = {
  all: 'Labels: All',
  selected: 'Labels: Selected',
  off: 'Labels: Off',
} as const;

export function Legend() {
  const hiddenFilters = useGraphStore(s => s.hiddenFilters);
  const toggleFilter = useGraphStore(s => s.toggleFilter);
  const labelMode = useSettingsStore(s => s.labelMode);
  const cycleLabelMode = useSettingsStore(s => s.cycleLabelMode);
  const colors = useSettingsStore(s => s.colors);
  const C = useThemeColors();

  // Map filter keys to custom colors
  const getColor = (item: typeof LEGEND_ITEMS[0]) => {
    const colorMap: Record<string, string> = {
      directory: colors.directory,
      typescript: colors.typescript,
      javascript: colors.javascript,
      python: colors.python,
      'dir-edge': colors.directoryEdge,
      import: colors.importEdge,
      'co-change': colors.coChangeEdge,
    };
    return colorMap[item.key] ?? item.color;
  };

  return (
    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 px-3 py-1.5 rounded-lg text-[11px] select-none pointer-events-auto"
      style={{ background: C.panelBg, border: `1px solid ${C.panelBorder}`, maxWidth: 'calc(100vw - 32px)' }}>
      {LEGEND_ITEMS.map(item => {
        const isHidden = hiddenFilters.has(item.key);
        const c = getColor(item);
        return (
          <button
            key={item.key}
            className="flex items-center gap-1 transition-opacity duration-200"
            style={{ opacity: isHidden ? 0.25 : 1, cursor: 'pointer' }}
            onClick={() => toggleFilter(item.key)}
            title={isHidden ? `Show ${item.label}` : `Hide ${item.label}`}
          >
            {item.shape === 'diamond' ? (
              <div className="w-2 h-2 rotate-45" style={{ background: c }} />
            ) : item.shape === 'dotted' ? (
              <div className="w-3 h-px" style={{ borderTop: `1px dashed ${c}` }} />
            ) : item.shape === 'line' ? (
              <div className="w-3 h-px" style={{ background: c }} />
            ) : (
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
            )}
            <span
              style={{
                color: C.textSecondary,
                textDecoration: isHidden ? 'line-through' : 'none',
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}

      {/* Divider */}
      <div className="w-px h-3 mx-0.5" style={{ background: C.panelBorder }} />

      {/* Label mode toggle */}
      <button
        className="px-1.5 py-0.5 rounded-sm transition-colors hover:bg-white/5"
        style={{ color: C.textSecondary }}
        onClick={cycleLabelMode}
        title="Cycle label display: All / Selected / Off"
      >
        {LABEL_MODE_DISPLAY[labelMode]}
      </button>
    </div>
  );
}
