import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Label for what failed (e.g. "3D 뷰"). Shown in the fallback. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Local class error boundary (React requires a class for componentDidCatch).
 *
 * Catches render/lifecycle throws in its child subtree so a crash there
 * unmounts only that subtree — not the whole app — and offers an explicit
 * retry. It does NOT swallow: the error is logged to the console and a
 * visible, honest fallback is shown.
 *
 * Scope note (no overclaiming): this catches React render/lifecycle errors
 * only. It does NOT auto-recover from async/promise rejections or raw WebGL
 * GPU context-loss — those need their own handling. The retry remounts the
 * subtree, which is enough for transient render-time failures.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 삼키지 않는다 — 콘솔에 드러낸다.
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center text-center px-6"
          style={{ background: '#0a0a0f', color: 'rgba(220, 210, 190, 0.85)' }}
          role="alert"
        >
          <p style={{ fontSize: '0.75rem', letterSpacing: '0.2em', opacity: 0.5, margin: 0 }}>
            ERROR
          </p>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0.5rem 0 0.4rem' }}>
            {this.props.label ?? '화면'}을 그리는 중 문제가 발생했습니다
          </h2>
          <p style={{ fontSize: '0.8rem', opacity: 0.6, maxWidth: '24rem', marginBottom: '1.25rem' }}>
            일시적인 렌더링 오류일 수 있어요. 다시 시도하거나 페이지를 새로고침해 주세요.
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.4rem',
              background: 'rgba(200, 180, 140, 0.15)',
              border: '1px solid rgba(200, 180, 140, 0.35)',
              color: 'rgba(220, 210, 190, 0.95)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
