'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { logClientError } from '@/lib/client-log';
import { installGlobalClientErrorHandlers, reportClientError } from '@/lib/client-error-reporter';

type ErrorBoundaryFallback = (reset: () => void) => ReactNode;

interface AppErrorBoundaryProps {
  children: ReactNode;
  fallback: ErrorBoundaryFallback;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };
  private uninstallGlobalErrorHandlers: (() => void) | null = null;

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidMount(): void {
    this.uninstallGlobalErrorHandlers = installGlobalClientErrorHandlers();
  }

  componentWillUnmount(): void {
    this.uninstallGlobalErrorHandlers?.();
    this.uninstallGlobalErrorHandlers = null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportClientError(error, { source: 'react_error_boundary', sampleRate: 1 });
    if (process.env.NODE_ENV !== 'production') {
      logClientError('App error boundary caught an error', error, { errorInfo });
    }
  }

  private reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.reset);
    }

    return this.props.children;
  }
}
