import { useRef, useState, useCallback, type ReactNode } from 'react';

interface DraggablePanelProps {
  children: ReactNode;
  defaultStyle: React.CSSProperties;
  className?: string;
  resizable?: boolean;
  minWidth?: number;
  minHeight?: number;
  visible?: boolean;
}

export function DraggablePanel({
  children,
  defaultStyle,
  className = '',
  resizable = false,
  minWidth = 140,
  minHeight = 60,
  visible = true,
}: DraggablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // --- Drag (only from the dedicated drag handle) ---
  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [offset]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    setOffset({
      x: dragState.current.origX + (e.clientX - dragState.current.startX),
      y: dragState.current.origY + (e.clientY - dragState.current.startY),
    });
  }, []);

  const onDragEnd = useCallback(() => {
    dragState.current = null;
  }, []);

  // --- Resize ---
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    resizeState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: size?.w ?? rect.width,
      origH: size?.h ?? rect.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [size]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeState.current) return;
    setSize({
      w: Math.max(minWidth, resizeState.current.origW + (e.clientX - resizeState.current.startX)),
      h: Math.max(minHeight, resizeState.current.origH + (e.clientY - resizeState.current.startY)),
    });
  }, [minWidth, minHeight]);

  const onResizeEnd = useCallback(() => {
    resizeState.current = null;
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className={`fixed z-40 ${className}`}
      style={{
        ...defaultStyle,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        ...(size ? { width: size.w, height: size.h } : {}),
      }}
    >
      {/* Drag handle — separate layer on top, does NOT interfere with children */}
      <div
        className="absolute top-0 inset-x-0 h-5 z-10 opacity-0 hover:opacity-100 transition-opacity"
        style={{ cursor: 'grab' }}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        <div className="w-full h-[3px] rounded-t" style={{ background: 'rgba(180, 180, 200, 0.25)' }} />
      </div>

      {children}

      {/* Resize handle */}
      {resizable && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 z-10 opacity-0 hover:opacity-40 transition-opacity"
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-0.5 right-0.5">
            <line x1="9" y1="1" x2="1" y2="9" stroke="rgba(180,180,200,0.6)" strokeWidth="1" />
            <line x1="9" y1="4" x2="4" y2="9" stroke="rgba(180,180,200,0.6)" strokeWidth="1" />
            <line x1="9" y1="7" x2="7" y2="9" stroke="rgba(180,180,200,0.6)" strokeWidth="1" />
          </svg>
        </div>
      )}
    </div>
  );
}
