
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 z-[9999] relative">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200">
            <div className="flex items-center gap-4 mb-6 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-full">
                <AlertTriangle size={32} />
              </div>
              <h1 className="text-2xl font-bold">Something went wrong</h1>
            </div>
            
            <div className="bg-slate-900 text-slate-200 p-4 rounded-lg overflow-auto max-h-96 font-mono text-sm mb-6">
              <p className="text-rose-400 font-bold mb-2">{this.state.error?.toString()}</p>
              <pre className="text-xs text-slate-400 whitespace-pre-wrap">
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-medium"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
