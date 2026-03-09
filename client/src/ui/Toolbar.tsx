import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore, type CustomColors, type EdgeStyleKey, type NodeStyleKey } from '../store/settings-store';
import { useGraphStore } from '../store/graph-store';
import { COLORS } from '../utils/colors';

// --- Color Picker Mini (portal-based to escape overflow clipping) ---

const PRESET_COLORS = [
  '#C7A4FF', '#89C4F4', '#FFD866', '#7EDCCC', '#FF8EC8',
  '#8888AA', '#4a4070', '#E8E0FF', '#FF6B6B', '#6BCB77',
  '#4D96FF', '#FFB347', '#A78BFA', '#F472B6', '#34D399',
  '#FBBF24', '#F87171', '#60A5FA', '#818CF8', '#E879F9',
];

function MiniColorPicker({ value, onChange, children }: {
  value: string; onChange: (c: string) => void; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHex(value), [value]);

  const openPopup = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        x: Math.max(8, rect.right - 180),
        y: rect.bottom + 4,
      });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="w-4 h-4 rounded-sm border border-white/10 shrink-0"
        style={{ background: value, boxShadow: `0 0 4px ${value}40` }}
        onClick={() => open ? setOpen(false) : openPopup()}
      />
      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[9999] p-2 rounded-md"
          style={{
            left: pos.x,
            top: pos.y,
            background: 'rgba(18, 18, 24, 0.97)',
            border: '1px solid rgba(180,180,200,0.15)',
            width: 180,
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="grid grid-cols-5 gap-1 mb-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className="w-5 h-5 rounded-sm border transition-transform hover:scale-110"
                style={{
                  background: c,
                  borderColor: c === value ? '#fff' : 'transparent',
                }}
                onClick={() => { onChange(c); setHex(c); }}
              />
            ))}
          </div>
          <input
            className="w-full px-1.5 py-0.5 text-[10px] rounded font-mono outline-none"
            style={{
              background: 'rgba(180,180,200,0.08)',
              border: '1px solid rgba(180,180,200,0.15)',
              color: COLORS.textPrimary,
            }}
            value={hex}
            onChange={(e) => {
              setHex(e.target.value);
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
            }}
            placeholder="#RRGGBB"
          />
          {children && (
            <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: '1px solid rgba(180,180,200,0.08)' }}>
              {children}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// --- Slider ---

function Slider({ value, onChange, min, max, label, suffix }: {
  value: number; onChange: (v: number) => void;
  min: number; max: number; label: string; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-20 shrink-0" style={{ color: COLORS.textSecondary }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-neutral-400 cursor-pointer"
        style={{ accentColor: 'rgba(180,180,200,0.6)' }}
      />
      <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>
        {value}{suffix}
      </span>
    </div>
  );
}

// --- Dropdown wrapper ---

function DropdownButton({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="px-2.5 py-1 text-[10px] tracking-wider uppercase rounded-sm transition-all duration-150"
        style={{
          background: open ? 'rgba(180,180,200,0.12)' : 'rgba(180,180,200,0.05)',
          border: '0.5px solid rgba(180,180,200,0.10)',
          color: open ? COLORS.textPrimary : COLORS.textSecondary,
        }}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 rounded-md overflow-y-auto max-h-[80vh]"
          style={{
            background: 'rgba(12, 12, 16, 0.95)',
            border: '0.5px solid rgba(180,180,200,0.10)',
            backdropFilter: 'blur(12px)',
            minWidth: 200,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// --- Panel Toggle Row ---

function ToggleRow({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-white/5"
      onClick={onToggle}
    >
      <div
        className="w-3 h-3 rounded-sm border flex items-center justify-center transition-colors"
        style={{
          borderColor: active ? 'rgba(180,180,200,0.4)' : 'rgba(180,180,200,0.15)',
          background: active ? 'rgba(180,180,200,0.15)' : 'transparent',
        }}
      >
        {active && <span style={{ color: COLORS.textPrimary, fontSize: 8, lineHeight: 1 }}>&#10003;</span>}
      </div>
      <span style={{ color: active ? COLORS.textPrimary : COLORS.textSecondary }}>{label}</span>
    </button>
  );
}

// --- Tiny slider for inside popup ---

function PopupSlider({ label, value, onChange, min, max, step = 1, suffix }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] w-12 shrink-0" style={{ color: COLORS.textSecondary }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-0.5 cursor-pointer"
        style={{ accentColor: 'rgba(180,180,200,0.5)' }}
      />
      <span className="text-[9px] w-7 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>
        {value}{suffix}
      </span>
    </div>
  );
}

// --- Node Color + Style Row (opacity + size inside popup) ---

function NodeColorRow({ label, colorKey, styleKey }: {
  label: string; colorKey: keyof CustomColors; styleKey: NodeStyleKey;
}) {
  const color = useSettingsStore(s => s.colors[colorKey]);
  const setColor = useSettingsStore(s => s.setColor);
  const style = useSettingsStore(s => s.nodeStyles[styleKey]);
  const setNodeStyle = useSettingsStore(s => s.setNodeStyle);

  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <MiniColorPicker value={color} onChange={(c) => setColor(colorKey, c)}>
        <PopupSlider label="Opacity" value={style.opacity} onChange={(v) => setNodeStyle(styleKey, { opacity: v })} min={10} max={100} suffix="%" />
        <PopupSlider label="Size" value={style.size} onChange={(v) => setNodeStyle(styleKey, { size: v })} min={50} max={200} suffix="%" />
      </MiniColorPicker>
      <span className="text-[10px]" style={{ color: COLORS.textSecondary }}>{label}</span>
    </div>
  );
}

// --- Edge Color + Style Row (weight + opacity inside popup) ---

function EdgeColorRow({ label, colorKey, styleKey }: {
  label: string; colorKey: keyof CustomColors; styleKey: EdgeStyleKey;
}) {
  const color = useSettingsStore(s => s.colors[colorKey]);
  const setColor = useSettingsStore(s => s.setColor);
  const style = useSettingsStore(s => s.edgeStyles[styleKey]);
  const setEdgeStyle = useSettingsStore(s => s.setEdgeStyle);

  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <MiniColorPicker value={color} onChange={(c) => setColor(colorKey, c)}>
        <PopupSlider label="Weight" value={style.weight} onChange={(v) => setEdgeStyle(styleKey, { weight: v })} min={1} max={5} />
        <PopupSlider label="Opacity" value={style.opacity} onChange={(v) => setEdgeStyle(styleKey, { opacity: v })} min={0} max={100} suffix="%" />
      </MiniColorPicker>
      <span className="text-[10px]" style={{ color: COLORS.textSecondary }}>{label}</span>
    </div>
  );
}

// --- Target Directory Row ---

function TargetDirectoryRow() {
  const currentPath = useGraphStore(s => s.targetPath);
  const retarget = useGraphStore(s => s.retarget);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentPath);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setValue(currentPath), [currentPath]);

  const handleSubmit = useCallback(async () => {
    if (!value.trim() || value.trim() === currentPath) {
      setEditing(false);
      return;
    }
    setLoading(true);
    setError('');
    const err = await retarget(value.trim());
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setEditing(false);
    }
  }, [value, currentPath, retarget]);

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.textSecondary }}>
          Target
        </span>
        {!editing && (
          <button
            className="text-[9px] px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
            style={{ color: COLORS.textSecondary }}
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1">
          <input
            className="w-full px-1.5 py-1 text-[10px] rounded font-mono outline-none"
            style={{
              background: 'rgba(180,180,200,0.06)',
              border: `1px solid ${error ? '#FF8EC8' : 'rgba(180,180,200,0.15)'}`,
              color: COLORS.textPrimary,
            }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setEditing(false); }}
            disabled={loading}
            autoFocus
          />
          <div className="flex gap-1">
            <button
              className="flex-1 text-[9px] py-0.5 rounded transition-colors"
              style={{
                background: 'rgba(180,180,200,0.08)',
                color: loading ? COLORS.textSecondary : COLORS.textPrimary,
              }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Scanning...' : 'Apply'}
            </button>
            <button
              className="text-[9px] px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
              style={{ color: COLORS.textSecondary }}
              onClick={() => { setEditing(false); setError(''); setValue(currentPath); }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="text-[9px]" style={{ color: '#FF8EC8' }}>{error}</p>
          )}
        </div>
      ) : (
        <p className="text-[10px] font-mono truncate" style={{ color: COLORS.textSecondary }}>
          {currentPath || 'Not set'}
        </p>
      )}
    </div>
  );
}

// --- Observe Mode Row ---

function ObserveRow() {
  const observeMode = useSettingsStore(s => s.observeMode);
  const setObserveMode = useSettingsStore(s => s.setObserveMode);

  return (
    <div className="px-3 pb-2">
      <button
        className="w-full py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase transition-all duration-300"
        style={{
          color: observeMode ? '#FFD9A8' : '#C4A882',
          background: observeMode ? 'rgba(255, 200, 120, 0.10)' : 'rgba(255, 200, 120, 0.04)',
          border: '0.5px solid rgba(200, 170, 120, 0.20)',
        }}
        onClick={() => setObserveMode(!observeMode)}
      >
        {observeMode ? 'Exit Observe' : 'Observe'}
      </button>
      <p className="mt-1 text-[9px] leading-tight" style={{ color: 'rgba(200, 180, 140, 0.4)' }}>
        {observeMode ? 'ESC or click to return' : 'Watch the stars quietly'}
      </p>
    </div>
  );
}

// --- Main Toolbar ---

export function Toolbar() {
  const panels = useSettingsStore(s => s.panels);
  const togglePanel = useSettingsStore(s => s.togglePanel);
  const fontSize = useSettingsStore(s => s.fontSize);
  const setFontSize = useSettingsStore(s => s.setFontSize);
  const signalIntensity = useSettingsStore(s => s.signalIntensity);
  const setSignalIntensity = useSettingsStore(s => s.setSignalIntensity);
  const bloomIntensity = useSettingsStore(s => s.bloomIntensity);
  const setBloomIntensity = useSettingsStore(s => s.setBloomIntensity);
  const resetColors = useSettingsStore(s => s.resetColors);

  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-2 select-none pointer-events-auto">
      {/* UI Toggles */}
      <DropdownButton label="UI">
        <div className="py-1">
          <ToggleRow label="Search" active={panels.search} onToggle={() => togglePanel('search')} />
          <ToggleRow label="Legend" active={panels.legend} onToggle={() => togglePanel('legend')} />
          <ToggleRow label="Activity" active={panels.activity} onToggle={() => togglePanel('activity')} />
          <ToggleRow label="Git Panel" active={panels.gitPanel} onToggle={() => togglePanel('gitPanel')} />
          <ToggleRow label="Node Detail" active={panels.nodeDetail} onToggle={() => togglePanel('nodeDetail')} />
          <ToggleRow label="Breadcrumb" active={panels.breadcrumb} onToggle={() => togglePanel('breadcrumb')} />
        </div>
      </DropdownButton>

      {/* Settings */}
      <DropdownButton label="Settings">
        <div className="py-2 px-1" style={{ width: 240 }}>
          {/* Colors section */}
          <div className="px-2 mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.textSecondary }}>Colors</span>
              <button
                className="text-[9px] px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
                style={{ color: COLORS.textSecondary }}
                onClick={resetColors}
              >
                Reset
              </button>
            </div>
          </div>
          <NodeColorRow label="Directory" colorKey="directory" styleKey="directory" />
          <NodeColorRow label="TypeScript" colorKey="typescript" styleKey="typescript" />
          <NodeColorRow label="JavaScript" colorKey="javascript" styleKey="javascript" />
          <NodeColorRow label="Python" colorKey="python" styleKey="python" />
          <EdgeColorRow label="Import Edge" colorKey="importEdge" styleKey="importEdge" />
          <EdgeColorRow label="Structure Edge" colorKey="directoryEdge" styleKey="directoryEdge" />
          <EdgeColorRow label="Co-change Edge" colorKey="coChangeEdge" styleKey="coChangeEdge" />

          <div className="my-2 mx-3 h-px" style={{ background: 'rgba(180,180,200,0.08)' }} />

          {/* Sliders */}
          <div className="px-3 space-y-2 pb-1">
            <Slider label="Font Size" value={fontSize} onChange={setFontSize} min={9} max={18} suffix="px" />
            <Slider label="Signal" value={signalIntensity} onChange={setSignalIntensity} min={1} max={100} />
            <Slider label="Bloom" value={bloomIntensity} onChange={setBloomIntensity} min={0} max={100} />
          </div>

          <div className="my-2 mx-3 h-px" style={{ background: 'rgba(180,180,200,0.08)' }} />

          {/* Target directory */}
          <TargetDirectoryRow />

          <div className="my-2 mx-3 h-px" style={{ background: 'rgba(180,180,200,0.08)' }} />

          {/* Observe mode */}
          <ObserveRow />
        </div>
      </DropdownButton>
    </div>
  );
}
