import { useMemo } from 'react';
import { useSettingsStore } from '../store/settings-store';
import { getTheme } from '../utils/themes';
import { COLORS } from '../utils/colors';

/**
 * Returns a COLORS-compatible object with theme-aware overrides for UI tokens.
 * Drop-in: `const C = useThemeColors();` then use `C.textPrimary` etc.
 */
export function useThemeColors() {
  const themeId = useSettingsStore(s => s.theme);
  return useMemo(() => {
    const theme = getTheme(themeId);
    return {
      ...COLORS,
      textPrimary: theme.colors.textPrimary,
      textSecondary: theme.colors.textSecondary,
      panelBg: theme.colors.panelBg,
      panelBorder: theme.colors.panelBorder,
      panelShadow: theme.colors.panelShadow,
      bg: theme.colors.bg,
      bgFog: theme.colors.bgFog,
      starPrimary: theme.colors.starPrimary,
      starSecondary: theme.colors.starSecondary,
      starTertiary: theme.colors.starTertiary,
    } as const;
  }, [themeId]);
}
