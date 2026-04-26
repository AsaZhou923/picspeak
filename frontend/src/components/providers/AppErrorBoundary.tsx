'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

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

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (process.env.NODE_ENV !== 'production') {
      console.error('App error boundary caught an error', error, errorInfo);
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
