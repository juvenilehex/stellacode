/**
 * 테마가 패널까지 닿는가 (R638).
 *
 * 설정에서 High Contrast 를 골라도 Toolbar·GitPanel·AboutModal·TimelineSlider 는
 * utils/colors.ts 의 고정 COLORS 를 읽어 Deep Space 값(보조 글자 0.52·테두리 0.07)을 그렸다.
 * 패널 토큰은 useThemeColors() 로만 읽는다 — 아래 두 시험이 그 계약이다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutModal } from '../AboutModal';
import type { ThemeId } from '../../utils/themes';
import { THEMES } from '../../utils/themes';

// zustand 의 서버 렌더는 getInitialState 로 고정돼 setTheme 이 SSR 에 안 보인다(zustand/react
// getServerSnapshot). 그래서 저장소만 같은 모양의 선택자 함수로 바꾸고, 그 뒤의
// useThemeColors → getTheme → 패널 경로는 진짜 코드를 그대로 탄다.
const state: { theme: ThemeId } = { theme: 'deep-space' };
vi.mock('../../store/settings-store', () => ({
  useSettingsStore: (sel: (s: { theme: ThemeId }) => unknown) => sel(state),
}));

const UI_DIR = join(__dirname, '..');
const PANEL_TOKEN = /COLORS\.(textPrimary|textSecondary|panelBg|panelBorder|panelShadow)\b/;
// Deep Space 패널 값을 손으로 적은 것 — 토큰을 우회한 같은 결함
const DEEP_SPACE_LITERAL = /rgba\(14,\s*14,\s*16|rgba\(255,\s*255,\s*255,\s*0\.(07|52)\)/;

describe('패널 색은 테마를 따른다', () => {
  afterEach(() => { state.theme = 'deep-space'; });

  it('ui/ 의 컴포넌트는 패널 토큰을 고정 COLORS 나 손 적은 값으로 읽지 않는다', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(UI_DIR).filter(n => n.endsWith('.tsx'))) {
      readFileSync(join(UI_DIR, f), 'utf-8').split('\n').forEach((line, i) => {
        if (PANEL_TOKEN.test(line) || DEEP_SPACE_LITERAL.test(line)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('High Contrast 로 바꾸면 About 패널의 글자·테두리 색이 바뀐다', () => {
    const render = () => renderToStaticMarkup(createElement(AboutModal, { open: true, onClose: () => {} }));
    const deep = render();
    const ds = THEMES['deep-space'].colors;
    const hc = THEMES['high-contrast'].colors;
    expect(deep).toContain(ds.textSecondary);
    expect(deep).toContain(ds.panelBorder);

    state.theme = 'high-contrast';
    const high = render();
    expect(high).toContain(hc.textSecondary);
    expect(high).toContain(hc.panelBorder);
    expect(high).not.toContain(ds.textSecondary);
  });
});
