/**
 * Theme system for StellaCode.
 *
 * Two themes:
 *   - "deep-space"    : the original dark palette (purples/blues, relaxed contrast)
 *   - "high-contrast" : enhanced visibility while keeping the observatory aesthetic
 *
 * Each theme provides overrides for the UI color tokens used throughout the app.
 * The 3D scene reads bloom / edge / star adjustments from the active theme config.
 */

export type ThemeId = 'deep-space' | 'high-contrast';

export interface ThemeColors {
  // Text
  textPrimary: string;
  textSecondary: string;

  // Panels
  panelBg: string;
  panelBorder: string;
  panelShadow: string;

  // Scene background
  bg: string;
  bgFog: string;

  // Stars (background)
  starPrimary: string;
  starSecondary: string;
  starTertiary: string;
}

export interface ThemeScene {
  /** Multiplier applied to bloom intensity (1.0 = no change) */
  bloomMultiplier: number;
  /** Multiplier applied to edge line brightness (1.0 = no change) */
  edgeBrightnessMultiplier: number;
  /** Multiplier applied to star opacity (1.0 = no change) */
  starOpacityMultiplier: number;
  /** Extra emissive intensity added to node materials */
  nodeEmissiveBoost: number;
  /** Multiplier for label outline width for readability */
  labelOutlineMultiplier: number;
}

export interface Theme {
  id: ThemeId;
  label: string;
  colors: ThemeColors;
  scene: ThemeScene;
}

// ── Deep Space (default) ──

const DEEP_SPACE: Theme = {
  id: 'deep-space',
  label: 'Deep Space',
  colors: {
    textPrimary: 'rgba(255, 255, 255, 0.92)',
    textSecondary: 'rgba(255, 255, 255, 0.52)',
    panelBg: 'rgba(14, 14, 16, 0.94)',
    panelBorder: 'rgba(255, 255, 255, 0.07)',
    panelShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
    bg: '#0C0C10',
    bgFog: '#0C0C10',
    starPrimary: '#B8B8CC',
    starSecondary: '#C8A0B0',
    starTertiary: '#8899AA',
  },
  scene: {
    bloomMultiplier: 1.0,
    edgeBrightnessMultiplier: 1.0,
    starOpacityMultiplier: 1.0,
    nodeEmissiveBoost: 0,
    labelOutlineMultiplier: 1.0,
  },
};

// ── High Contrast ──
// Brighter text, stronger borders, enhanced glow — still dark and atmospheric

const HIGH_CONTRAST: Theme = {
  id: 'high-contrast',
  label: 'High Contrast',
  colors: {
    textPrimary: 'rgba(255, 255, 255, 1.0)',
    textSecondary: 'rgba(255, 255, 255, 0.78)',
    panelBg: 'rgba(8, 8, 10, 0.97)',
    panelBorder: 'rgba(255, 255, 255, 0.22)',
    panelShadow: '0 4px 24px rgba(0, 0, 0, 0.6)',
    bg: '#060608',
    bgFog: '#060608',
    starPrimary: '#D8D8EC',
    starSecondary: '#E0B8C8',
    starTertiary: '#A8B8CC',
  },
  scene: {
    bloomMultiplier: 1.6,
    edgeBrightnessMultiplier: 1.8,
    starOpacityMultiplier: 1.5,
    nodeEmissiveBoost: 0.2,
    labelOutlineMultiplier: 1.6,
  },
};

// ── Registry ──

export const THEMES: Record<ThemeId, Theme> = {
  'deep-space': DEEP_SPACE,
  'high-contrast': HIGH_CONTRAST,
};

/** Get the theme config for a given ID, with safe fallback */
export function getTheme(id: ThemeId): Theme {
  return THEMES[id] ?? DEEP_SPACE;
}
