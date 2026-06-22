import { useEffect, useRef } from 'react';
import { COLORS } from '../utils/colors';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

const METAPHORS = [
  { term: 'Star', meaning: 'File', color: COLORS.typescript },
  { term: 'Constellation Line', meaning: 'Import dependency', color: COLORS.importEdge },
  { term: 'Co-change', meaning: 'Temporal coupling (git)', color: COLORS.coChangeEdge },
  { term: 'Trail', meaning: 'AI agent trace', color: COLORS.agentClaude },
  { term: 'Diamond', meaning: 'Directory', color: COLORS.directory },
  { term: 'Deep Space', meaning: 'Background', color: COLORS.bg },
];

export function AboutModal({ open, onClose }: AboutModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // 열릴 때 트리거(직전 포커스)를 저장 — 닫을 때 복원한다.
    const trigger = document.activeElement as HTMLElement | null;

    // 패널 내부의 보이는·활성 focusable만 추림(disabled/hidden 제외).
    const getFocusable = (): HTMLElement[] => {
      const root = panelRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
    };

    // 초기 포커스: 첫 focusable(없으면 패널 자체).
    (getFocusable()[0] ?? panelRef.current)?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // Tab 트랩: 포커스를 패널 안에 가둔다(배경 탈출 방지).
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current?.contains(active);
      if (e.shiftKey) {
        if (active === first || !inside) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !inside) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      // 닫을 때 트리거가 아직 DOM에 살아있을 때만 포커스 복원.
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="StellaCode 정보"
        tabIndex={-1}
        className="relative w-[480px] max-w-[calc(100vw-32px)] max-h-[80vh] overflow-y-auto rounded-lg text-xs select-none outline-none"
        style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.panelBorder}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: COLORS.textPrimary }}>
              StellaCode
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(199,164,255,0.1)', color: COLORS.directory }}>
              v1.1
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-sm px-1 hover:opacity-70"
            style={{ color: COLORS.textSecondary }}
          >
            x
          </button>
        </div>

        {/* Definition */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
          <div className="text-sm mb-2" style={{ color: COLORS.textPrimary }}>
            Code Observatory
          </div>
          <div style={{ color: COLORS.textSecondary }} className="leading-relaxed">
            Observe your codebase as a living constellation.
            Static analysis, git history, real-time file watching, and AI agent tracking
            -- combined into a single three-dimensional view.
          </div>
        </div>

        {/* Problem / Solution */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
          <div className="mb-1.5 font-medium" style={{ color: COLORS.textPrimary }}>
            Why
          </div>
          <div style={{ color: COLORS.textSecondary }} className="leading-relaxed space-y-1">
            <div>
              AI agents write code faster than humans can comprehend it.
              Projects grow, but understanding doesn't keep up.
            </div>
            <div>
              Existing tools show snapshots of the current state.
              StellaCode adds time -- git history reveals hidden coupling,
              hot files, and the traces AI agents leave behind.
            </div>
          </div>
        </div>

        {/* Metaphor Dictionary */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
          <div className="mb-2 font-medium" style={{ color: COLORS.textPrimary }}>
            Metaphor Dictionary
          </div>
          <div className="space-y-1">
            {METAPHORS.map(({ term, meaning, color }) => (
              <div key={term} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span style={{ color: COLORS.textPrimary }}>{term}</span>
                <span style={{ color: COLORS.textSecondary }}>{meaning}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Principles */}
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
          <div className="mb-2 font-medium" style={{ color: COLORS.textPrimary }}>
            Principles
          </div>
          <div className="space-y-1" style={{ color: COLORS.textSecondary }}>
            <div>1. Observe, don't prescribe -- surface patterns, let humans decide.</div>
            <div>2. Time over snapshot -- history shapes understanding of direction.</div>
            <div>3. Discover, don't search -- hidden relationships are the real insight.</div>
          </div>
        </div>

        {/* Feedback */}
        <div className="px-4 py-3">
          <div className="mb-2 font-medium" style={{ color: COLORS.textPrimary }}>
            Feedback
          </div>
          <div className="space-y-1.5" style={{ color: COLORS.textSecondary }}>
            <div>Bug reports, feature ideas, or share your constellation:</div>
            <div className="flex items-center gap-3">
              <a
                href="https://discord.gg/VGQJSda5eZ"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
                style={{ color: '#7289da' }}
              >
                Discord
              </a>
              <a
                href="https://github.com/juvenilehex/stellacode/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
                style={{ color: COLORS.textSecondary }}
              >
                GitHub Issues
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
