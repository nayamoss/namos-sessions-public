import { Component, type ErrorInfo, type ReactNode } from "react";
import { cleanErrorMessage } from "@/lib/errors";

/**
 * Convex's `useQuery` throws synchronously when the query itself rejects (forbidden access, a
 * stale/merged contact, a mismatched-email merge preflight, …) — the same reason
 * NotificationPanel and NotificationBell wrap themselves in a boundary. The organization CRM
 * workspace (#268) reads several org-scoped queries directly, so every one of those read sites
 * gets this instead of letting one failed query blank the whole detail pane or merge dialog.
 */
export class CrmQueryErrorBoundary extends Component<
  { children: ReactNode; fallback: (message: string, retryKey: number) => ReactNode },
  { error?: Error; retryKey: number }
> {
  state: { error?: Error; retryKey: number } = { retryKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error(error);
  }

  retry = () => {
    this.setState((current) => ({ error: undefined, retryKey: current.retryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return this.props.fallback(cleanErrorMessage(this.state.error, "This couldn't be loaded."), this.state.retryKey);
    }
    // Keying on retryKey remounts the subtree after a retry so a fresh render attempts the
    // query again instead of re-throwing the same cached error.
    return <span key={this.state.retryKey}>{this.props.children}</span>;
  }
}
