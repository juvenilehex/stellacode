import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useGraphStore } from '../store/graph-store';
import { COLORS, getNodeColor } from '../utils/colors';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const data = useGraphStore(s => s.data);
  const selectNode = useGraphStore(s => s.selectNode);

  useEffect(() => {
    return () => { if (blurTimer.current) clearTimeout(blurTimer.current); };
  }, []);

  const results = useMemo(() => {
    if (!query.trim() || !data) return [];
    const q = query.toLowerCase();
    return data.nodes
      .filter(n => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, data]);

  const handleSelect = useCallback((nodeId: string) => {
    selectNode(nodeId);
    setQuery('');
    setOpen(false);
  }, [selectNode]);

  return (
    <div className="pointer-events-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 200); }}
          placeholder="Search files..."
          className="w-64 px-3 py-1.5 rounded-md text-xs outline-none"
          style={{
            background: COLORS.panelBg,
            border: `1px solid ${COLORS.panelBorder}`,
            color: COLORS.textPrimary,
          }}
        />

        {open && results.length > 0 && (
          <div className="absolute top-full mt-1 w-full rounded-md overflow-hidden text-xs"
            style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}>
            {results.map(node => (
              <button
                key={node.id}
                onMouseDown={() => handleSelect(node.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-white/5"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: getNodeColor(node.type, node.language) }} />
                <span className="truncate" style={{ color: COLORS.textPrimary }}>
                  {node.label}
                </span>
                <span className="ml-auto truncate" style={{ color: COLORS.textSecondary, fontSize: '9px' }}>
                  {node.id.replace(/^(file:|dir:)/, '').split('/').slice(0, -1).join('/')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
