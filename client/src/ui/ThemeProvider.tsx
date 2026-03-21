import { useEffect } from 'react';
import { useSettingsStore } from '../store/settings-store';
import { getTheme } from '../utils/themes';

/**
 * Applies the active theme as CSS custom properties on <html>.
 * Also sets a `data-theme` attribute for any CSS-based selectors.
 *
 * Render this once near the root of the app.
 */
export function ThemeProvider() {
  const themeId = useSettingsStore(s => s.theme);

  useEffect(() => {
    const theme = getTheme(themeId);
    const root = document.documentElement;

    root.setAttribute('data-theme', themeId);

    // Map theme colors to CSS custom properties
    root.style.setProperty('--sc-text-primary', theme.colors.textPrimary);
    root.style.setProperty('--sc-text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--sc-panel-bg', theme.colors.panelBg);
    root.style.setProperty('--sc-panel-border', theme.colors.panelBorder);
    root.style.setProperty('--sc-panel-shadow', theme.colors.panelShadow);
    root.style.setProperty('--sc-bg', theme.colors.bg);

    // Scene hints (consumed by Three.js components via store, but also useful for CSS)
    root.style.setProperty('--sc-bloom-mult', String(theme.scene.bloomMultiplier));
    root.style.setProperty('--sc-edge-bright-mult', String(theme.scene.edgeBrightnessMultiplier));
  }, [themeId]);

  return null;
}
