import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { fallback: ReactNode; children: ReactNode };
type State = { hasError: boolean };

/**
 * Replaces Sentry.ErrorBoundary. Sentry was removed because it shipped ~267KB of
 * vendor JS and installed session replay on every page while VITE_SENTRY_DSN was
 * never configured, so nothing was ever reported. React requires a class here:
 * componentDidCatch has no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
