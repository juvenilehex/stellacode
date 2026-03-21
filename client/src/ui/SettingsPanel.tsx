import type React from 'react';
import { useState, useRef, useCallback } from 'react';
import { useSettingsStore } from '../store/settings-store';
import { useGraphStore } from '../store/graph-store';
import { COLORS } from '../utils/colors';
import { THEMES, type ThemeId } from '../utils/themes';

// ── Section Header ──

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 pt-3 pb-1">
      <span
        className="text-[10px] uppercase tracking-[0.15em]"
        style={{ color: COLORS.textSecondary }}
      >
        {title}
      </span>
    </div>
  );
}

// ── Tooltip Wrapper ──

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => {
        timer.current = setTimeout(() => setShow(true), 400);
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current);
        setShow(false);
      }}
    >
      {children}
      {show && (
        <div
          className="absolute left-0 bottom-full mb-1 px-2 py-1 rounded text-[10px] leading-snug z-50 whitespace-normal"
          style={{
            background: 'rgba(14, 14, 16, 0.98)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: COLORS.textSecondary,
            width: 220,
            pointerEvents: 'none',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ── Slider (matches Toolbar pattern) ──

function SettingsSlider({ value, onChange, min, max, step = 1, label, suffix, hint }: {
  value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; label: string; suffix?: string; hint?: string;
}) {
  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] w-20 shrink-0" style={{ color: COLORS.textSecondary }}>{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1 cursor-pointer"
          style={{ accentColor: 'rgba(180,180,200,0.6)' }}
        />
        <span className="text-[10px] w-14 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>
          {value.toLocaleString()}{suffix}
        </span>
      </div>
      {hint && (
        <p className="text-[9px] mt-0.5 ml-[88px]" style={{ color: 'rgba(180,180,200,0.35)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Network Section (CORS Origins) ──

function NetworkSection() {
  return (
    <div>
      <SectionHeader title="Network" />
      <div className="px-3 pb-2 space-y-2">
        <Tip text="Add domains that can access StellaCode remotely (e.g., https://my-server.com). Set via the STELLA_CORS_ORIGINS environment variable.">
          <span
            className="text-[10px] cursor-help border-b border-dashed"
            style={{ color: COLORS.textSecondary, borderColor: 'rgba(180,180,200,0.2)' }}
          >
            CORS Allowed Origins
          </span>
        </Tip>

        <div
          className="rounded px-2 py-1.5 text-[10px] font-mono leading-relaxed"
          style={{
            background: 'rgba(180,180,200,0.04)',
            border: '1px solid rgba(180,180,200,0.08)',
            color: COLORS.textSecondary,
          }}
        >
          <div style={{ color: 'rgba(180,180,200,0.35)' }}>
            STELLA_CORS_ORIGINS
          </div>
          <div className="mt-0.5" style={{ color: COLORS.textPrimary }}>
            http://localhost:*
          </div>
        </div>

        <p className="text-[9px] leading-snug" style={{ color: 'rgba(180,180,200,0.35)' }}>
          To allow remote access, set the <span className="font-mono">STELLA_CORS_ORIGINS</span> environment
          variable before starting the server. Comma-separate multiple origins.
        </p>
        <div
          className="rounded px-2 py-1 text-[10px] font-mono"
          style={{
            background: 'rgba(180,180,200,0.04)',
            border: '1px solid rgba(180,180,200,0.06)',
            color: 'rgba(180,180,200,0.4)',
          }}
        >
          STELLA_CORS_ORIGINS=https://a.com,https://b.com
        </div>
      </div>
    </div>
  );
}

// ── Scanning Section ──

function ScanningSection() {
  const scanMaxFiles = useSettingsStore(s => s.scanMaxFiles);
  const scanMaxDepth = useSettingsStore(s => s.scanMaxDepth);
  const setScanMaxFiles = useSettingsStore(s => s.setScanMaxFiles);
  const setScanMaxDepth = useSettingsStore(s => s.setScanMaxDepth);

  return (
    <div>
      <SectionHeader title="Scanning" />
      <SettingsSlider
        label="Max Files"
        value={scanMaxFiles}
        onChange={setScanMaxFiles}
        min={1000}
        max={100000}
        step={1000}
        hint="Recommended: 10,000"
      />
      <SettingsSlider
        label="Max Depth"
        value={scanMaxDepth}
        onChange={setScanMaxDepth}
        min={5}
        max={100}
        hint="Recommended: 30"
      />
      <p className="px-3 pb-2 text-[9px] leading-snug" style={{ color: 'rgba(180,180,200,0.35)' }}>
        These values guide the server scanner. Higher limits increase scan time for large projects.
        Restart the scan after changing values.
      </p>
    </div>
  );
}

// ── Layout Presets Section ──

const LAYOUT_PRESETS = [
  { label: 'Compact', cohesion: 80, description: 'Files cluster tightly by directory' },
  { label: 'Balanced', cohesion: 50, description: 'Default spacing' },
  { label: 'Spread', cohesion: 20, description: 'Files spread out for clarity' },
] as const;

function LayoutSection() {
  const dirCohesion = useSettingsStore(s => s.dirCohesion);
  const setDirCohesion = useSettingsStore(s => s.setDirCohesion);
  const relayout = useGraphStore(s => s.relayout);

  const relayoutTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const applyPreset = useCallback((cohesion: number) => {
    setDirCohesion(cohesion);
    relayout(cohesion);
  }, [setDirCohesion, relayout]);

  const debouncedRelayout = useCallback((v: number) => {
    setDirCohesion(v);
    if (relayoutTimer.current) clearTimeout(relayoutTimer.current);
    relayoutTimer.current = setTimeout(() => relayout(v), 300);
  }, [setDirCohesion, relayout]);

  return (
    <div>
      <SectionHeader title="Layout" />

      {/* Preset buttons */}
      <div className="px-3 pb-2">
        <div className="flex gap-1.5">
          {LAYOUT_PRESETS.map(preset => {
            const isActive = dirCohesion === preset.cohesion;
            return (
              <Tip key={preset.label} text={preset.description}>
                <button
                  className="flex-1 py-1.5 rounded-sm text-[10px] tracking-wide transition-all duration-200"
                  style={{
                    color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
                    background: isActive ? 'rgba(180,180,200,0.12)' : 'rgba(180,180,200,0.04)',
                    border: `0.5px solid ${isActive ? 'rgba(180,180,200,0.20)' : 'rgba(180,180,200,0.08)'}`,
                  }}
                  onClick={() => applyPreset(preset.cohesion)}
                >
                  {preset.label}
                </button>
              </Tip>
            );
          })}
        </div>
      </div>

      {/* Cohesion slider */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] w-20 shrink-0" style={{ color: COLORS.textSecondary }}>Cohesion</span>
          <input
            type="range"
            min={0}
            max={100}
            value={dirCohesion}
            onChange={(e) => debouncedRelayout(Number(e.target.value))}
            className="flex-1 h-1 cursor-pointer"
            style={{ accentColor: 'rgba(180,180,200,0.6)' }}
          />
          <span className="text-[10px] w-8 text-right tabular-nums" style={{ color: COLORS.textSecondary }}>
            {dirCohesion}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Theme Section ──

function ThemeSection() {
  const theme = useSettingsStore(s => s.theme);
  const setTheme = useSettingsStore(s => s.setTheme);

  return (
    <div>
      <SectionHeader title="Theme" />
      <div className="px-3 pb-2">
        <div className="flex gap-1.5">
          {(Object.keys(THEMES) as ThemeId[]).map(id => {
            const isActive = theme === id;
            return (
              <button
                key={id}
                className="flex-1 py-1.5 rounded-sm text-[10px] tracking-wide transition-all duration-200"
                style={{
                  color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
                  background: isActive ? 'rgba(180,180,200,0.12)' : 'rgba(180,180,200,0.04)',
                  border: `0.5px solid ${isActive ? 'rgba(180,180,200,0.20)' : 'rgba(180,180,200,0.08)'}`,
                }}
                onClick={() => setTheme(id)}
              >
                {THEMES[id].label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[9px] leading-snug" style={{ color: 'rgba(180,180,200,0.35)' }}>
          High Contrast enhances text, borders, constellation lines, and star glow for improved readability.
        </p>
      </div>
    </div>
  );
}

// ── Divider ──

function Divider() {
  return <div className="my-1 mx-3 h-px" style={{ background: 'rgba(180,180,200,0.08)' }} />;
}

// ── Main Settings Panel ──

export function SettingsPanel() {
  return (
    <div
      className="w-64 rounded-lg text-xs select-none overflow-y-auto"
      style={{
        background: COLORS.panelBg,
        border: `1px solid ${COLORS.panelBorder}`,
        maxHeight: 'calc(100vh - 80px)',
      }}
    >
      {/* Header */}
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
        <div className="flex items-center gap-2">
          {/* Gear icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: COLORS.textSecondary }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="text-[11px] font-medium" style={{ color: COLORS.textPrimary }}>
            Settings
          </span>
        </div>
      </div>

      {/* Sections */}
      <ThemeSection />
      <Divider />
      <NetworkSection />
      <Divider />
      <ScanningSection />
      <Divider />
      <LayoutSection />

      {/* Bottom padding */}
      <div className="h-2" />
    </div>
  );
}
