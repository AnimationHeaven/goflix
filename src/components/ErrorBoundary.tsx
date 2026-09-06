import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Without this, an unhandled error in any component takes the whole app
 * down to a blank white/black screen with no way back except force-closing
 * and relaunching — on Android that's indistinguishable from the crash this
 * app spent a lot of effort getting rid of. Catches render-time errors
 * (not async ones — those still need their own try/catch) and offers a
 * reload instead of a dead screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <p className="font-display text-3xl tracking-wide text-white">
          GO<span className="text-accent">FLIX</span>
        </p>
        <p className="text-lg font-medium text-white">Something went wrong.</p>
        <p className="max-w-md text-sm text-zinc-400">
          An unexpected error crashed the current view. Reloading usually fixes it — your
          favorites, watch progress, and token are all saved separately and won't be affected.
        </p>
        <pre className="max-w-md overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-xs text-zinc-500">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover"
        >
          Reload
        </button>
      </div>
    );
  }
}
