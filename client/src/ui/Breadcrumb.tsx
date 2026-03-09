import { useGraphStore } from '../store/graph-store';
import { COLORS } from '../utils/colors';

export function Breadcrumb() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const selectNode = useGraphStore(s => s.selectNode);

  if (!selectedNodeId) return null;

  const path = selectedNodeId.replace(/^(file:|dir:)/, '');
  const parts = path.split('/');

  return (
    <div className="flex items-center gap-1 px-3 py-1 rounded-md text-[10px] pointer-events-auto"
      style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        const dirPath = `dir:${parts.slice(0, i + 1).join('/')}`;

        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span style={{ color: COLORS.textSecondary }}>/</span>}
            {isLast ? (
              <span style={{ color: COLORS.textPrimary }}>{part}</span>
            ) : (
              <button
                onClick={() => selectNode(dirPath)}
                className="hover:underline"
                style={{ color: COLORS.directory }}
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
