import React from "react";
import i18n from "../../i18n";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", color: "#c00" }}>
          <h3>{i18n.t('common:errorBoundary.title')}</h3>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
          </pre>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            {i18n.t('common:errorBoundary.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
