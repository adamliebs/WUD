import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level React error boundary.
 *
 * Catches render-phase errors anywhere in the tree, logs to console (and
 * eventually a crash reporter), and shows a friendly fallback UI instead of
 * a white screen. Apple cares less about boundaries specifically than about
 * the app never appearing dead — without this, any throw during render kills
 * the WebView root and the user sees a blank phone.
 *
 * Reset == hard reload (location.reload). We don't try to recover in place
 * because the offending component might re-mount immediately and re-throw;
 * a clean reload routes the user back through bootstrap → splash → app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Always log — even when a crash reporter is wired up, the local devtools
    // are still the first place to look in development.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reload = () => {
    // Hard reload — see class comment for why we don't try in-place recovery.
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="absolute inset-0 bg-[#07060b] flex items-center justify-center px-8 text-center">
        <div className="max-w-xs">
          <div className="text-5xl mb-4">😬</div>
          <div className="text-white text-lg font-bold mb-2">Something broke</div>
          <div className="text-zinc-400 text-sm leading-relaxed mb-6">
            WUD hit an unexpected snag and stopped rendering. Reloading usually
            fixes it. If it keeps happening, drop us a note at
            {' '}
            <span className="text-rose-300">adam@lieberman.co.za</span>.
          </div>
          <button
            onClick={this.reload}
            className="px-5 py-2.5 rounded-full text-sm font-bold text-white
                       bg-gradient-to-br from-rose-500 to-orange-500
                       shadow-[0_8px_24px_-8px_rgba(244,63,94,0.6)]"
          >
            Reload WUD
          </button>
        </div>
      </div>
    );
  }
}
