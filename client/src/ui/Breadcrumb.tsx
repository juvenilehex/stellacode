import { useGraphStore } from '../store/graph-store';
import { COLORS } from '../utils/colors';
import { useThemeColors } from '../hooks/useThemeColors';

export function Breadcrumb() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const selectNode = useGraphStore(s => s.selectNode);
  const C = useThemeColors();

  if (!selectedNodeId) return null;

  const path = selectedNodeId.replace(/^(file:|dir:)/, '');
  const parts = path.split('/');

  return (
    <div className="flex items-center gap-1 px-3 py-1 rounded-md text-[10px] pointer-events-auto"
      style={{ background: C.panelBg, border: `1px solid ${C.panelBorder}` }}>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        const dirPath = `dir:${parts.slice(0, i + 1).join('/')}`;

        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span style={{ color: C.textSecondary }}>/</span>}
            {isLast ? (
              <span style={{ color: C.textPrimary }}>{part}</span>
            ) : (
              <button
                onClick={() => selectNode(dirPath)}
                className="hover:underline"
                style={{ color: C.directory }}
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
