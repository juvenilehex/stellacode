import { useEffect, useState } from 'react';
import { useGraphStore } from '../store/graph-store';
import { COLORS, getNodeColor } from '../utils/colors';

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function HoverTooltip() {
  const hoveredNodeId = useGraphStore(s => s.hoveredNodeId);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const nodeMap = useGraphStore(s => s.nodeMap);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function onMove(e: PointerEvent) {
      setPointer({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Don't show tooltip if nothing hovered or if the hovered node is already selected (detail panel open)
  if (!hoveredNodeId || hoveredNodeId === selectedNodeId) return null;

  const node = nodeMap.get(hoveredNodeId);
  if (!node) return null;

  const color = getNodeColor(node.type, node.language);
  const lastModified = node.meta?.lastModified as number | undefined;
  const commitCount = node.meta?.commitCount as number | undefined;
  const filePath = node.id.replace(/^(file:|dir:)/, '');

  // Position: offset from cursor, keep within viewport
  const offsetX = 16;
  const offsetY = -8;
  const tooltipWidth = 220;
  const tooltipHeight = 80;
  const x = pointer.x + offsetX + tooltipWidth > window.innerWidth
    ? pointer.x - offsetX - tooltipWidth
    : pointer.x + offsetX;
  const y = pointer.y + offsetY + tooltipHeight > window.innerHeight
    ? pointer.y - tooltipHeight
    : pointer.y + offsetY;

  return (
    <div
      className="fixed z-50 rounded-md px-2.5 py-2 text-[11px] pointer-events-none select-none"
      style={{
        left: x,
        top: y,
        background: 'rgba(12, 12, 16, 0.92)',
        border: `1px solid rgba(180, 180, 200, 0.15)`,
        backdropFilter: 'blur(8px)',
        maxWidth: tooltipWidth,
      }}
    >
      {/* Name + color dot */}
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: color, boxShadow: `0 0 4px ${color}` }}
        />
        <span className="font-medium truncate" style={{ color: COLORS.textPrimary }}>
          {node.label}
        </span>
        {node.language && (
          <span className="ml-auto shrink-0" style={{ color: COLORS.textSecondary, fontSize: '10px' }}>
            {node.language}
          </span>
        )}
      </div>

      {/* Path */}
      <div
        className="truncate mb-1.5"
        style={{ color: COLORS.textSecondary, fontSize: '10px' }}
      >
        {filePath}
      </div>

      {/* Git info row */}
      <div className="flex items-center gap-3" style={{ color: COLORS.textSecondary }}>
        {lastModified && (
          <span>{formatRelativeTime(lastModified)}</span>
        )}
        {commitCount != null && (
          <span>{commitCount} edit{commitCount !== 1 ? 's' : ''}</span>
        )}
        {node.type === 'file' && (
          <span>{node.lineCount} lines</span>
        )}
      </div>
    </div>
  );
}
