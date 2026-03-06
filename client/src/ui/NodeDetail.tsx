import { useGraphStore } from '../store/graph-store';
import { COLORS, getNodeColor } from '../utils/colors';

interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
}

export function NodeDetail() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const nodeMap = useGraphStore(s => s.nodeMap);
  const selectNode = useGraphStore(s => s.selectNode);
  const connectedNodeIds = useGraphStore(s => s.connectedNodeIds);

  if (!selectedNodeId) return null;

  const node = nodeMap.get(selectedNodeId);
  if (!node) return null;

  const connectedNodes: typeof node[] = [];
  for (const id of connectedNodeIds) {
    const cn = nodeMap.get(id);
    if (cn) connectedNodes.push(cn);
  }
  const symbols = (node.meta?.symbols as SymbolInfo[] | undefined) ?? [];
  const color = getNodeColor(node.type, node.language);

  return (
    <div className="fixed top-4 right-4 w-72 max-h-[80vh] overflow-y-auto rounded-lg text-xs select-none pointer-events-auto"
      style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-medium truncate" style={{ color: COLORS.textPrimary }}>
            {node.label}
          </span>
        </div>
        <button
          onClick={() => selectNode(null)}
          className="text-sm px-1 hover:opacity-70 shrink-0"
          style={{ color: COLORS.textSecondary }}
        >
          x
        </button>
      </div>

      {/* File info */}
      <div className="px-3 py-2 space-y-1" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
        <div style={{ color: COLORS.textSecondary }} className="break-all">
          {node.id.replace(/^(file:|dir:)/, '')}
        </div>
        <div className="flex gap-3">
          {node.type === 'file' && (
            <>
              <span style={{ color: COLORS.textSecondary }}>
                {node.lineCount} lines
              </span>
              <span style={{ color: COLORS.textSecondary }}>
                {node.language}
              </span>
            </>
          )}
          <span style={{ color: COLORS.textSecondary }}>
            {node.degree} connections
          </span>
        </div>
      </div>

      {/* Symbols */}
      {symbols.length > 0 && (
        <div className="px-3 py-2" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
          <div className="mb-1" style={{ color: COLORS.textSecondary }}>
            Symbols ({symbols.length})
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {symbols.map((sym, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <SymbolIcon kind={sym.kind} />
                <span style={{ color: sym.exported ? COLORS.textPrimary : COLORS.textSecondary }}>
                  {sym.name}
                </span>
                <span className="ml-auto font-mono" style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
                  :{sym.line}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected nodes */}
      {connectedNodes.length > 0 && (
        <div className="px-3 py-2">
          <div className="mb-1" style={{ color: COLORS.textSecondary }}>
            Connected ({connectedNodes.length})
          </div>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {connectedNodes.map(cn => (
              <button
                key={cn.id}
                onClick={() => selectNode(cn.id)}
                className="flex items-center gap-1.5 w-full text-left hover:opacity-70"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: getNodeColor(cn.type, cn.language) }} />
                <span className="truncate" style={{ color: COLORS.textPrimary }}>
                  {cn.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SymbolIcon({ kind }: { kind: string }) {
  const icons: Record<string, { label: string; color: string }> = {
    function: { label: 'fn', color: '#89C4F4' },
    class: { label: 'C', color: '#C7A4FF' },
    interface: { label: 'I', color: '#7EDCCC' },
    type: { label: 'T', color: '#FFD866' },
    enum: { label: 'E', color: '#FF8EC8' },
    method: { label: 'm', color: '#89C4F4' },
    variable: { label: 'v', color: '#9890B0' },
  };
  const icon = icons[kind] ?? { label: '?', color: '#888' };

  return (
    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-bold shrink-0"
      style={{ background: `${icon.color}22`, color: icon.color }}>
      {icon.label}
    </span>
  );
}
