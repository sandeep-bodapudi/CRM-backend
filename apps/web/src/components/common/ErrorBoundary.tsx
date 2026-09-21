import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI module:', error, errorInfo);
  }

  public handleReset = () => {
    // A stale-chunk failure ("Failed to fetch dynamically imported module")
    // can't be recovered by just clearing this boundary's error state --
    // the underlying lazy import() still points at a filename the last
    // deploy deleted, so re-rendering retries the exact same fetch and
    // fails again immediately. Only a real page reload re-fetches the
    // current index.html and its current chunk hashes.
    const message = this.state.error?.message || '';
    if (
      /dynamically imported module|Loading chunk|Importing a module script failed/i.test(message)
    ) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-8 text-center bg-white rounded-3xl border border-rose-100 shadow-xl max-w-lg mx-auto my-12">
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 mx-auto mb-4 border border-rose-100">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Something went wrong in this module</h3>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            {this.state.error?.message ||
              'An unexpected rendering error occurred while loading this view.'}
          </p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Module Workstation</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
