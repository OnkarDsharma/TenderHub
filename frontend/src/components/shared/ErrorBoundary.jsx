import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled Application Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-paper dark:bg-slate-900">
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-chinarRed flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white">
            Something went wrong
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mt-1 mb-3">
            An unexpected error occurred while rendering this page.
          </p>
          {this.state.error?.message && (
            <p className="text-[11px] font-mono text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 rounded border border-red-200 dark:border-red-900/60 max-w-lg mb-4 break-words">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-3">
            <Button onClick={() => window.location.reload()} className="text-xs">
              Reload Page
            </Button>
            <Button variant="outline" onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/tenders'; }} className="text-xs">
              Go to Directory
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
