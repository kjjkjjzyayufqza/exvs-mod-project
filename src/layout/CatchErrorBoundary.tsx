import { Component, type ErrorInfo, type ReactNode } from "react";

function resetKeysEqual(left: readonly unknown[] | undefined, right: readonly unknown[] | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => Object.is(value, right[index]));
}

type CatchErrorBoundaryProps = {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
  resetKeys?: readonly unknown[];
};

type CatchErrorBoundaryState = {
  error: Error | null;
};

/**
 * Isolates render failures so one KeepAlive page or WebGL canvas cannot unmount the app shell.
 */
export class CatchErrorBoundary extends Component<CatchErrorBoundaryProps, CatchErrorBoundaryState> {
  state: CatchErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): CatchErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[page-error-boundary]", error, info.componentStack);
  }

  componentDidUpdate(prevProps: CatchErrorBoundaryProps): void {
    if (this.state.error && !resetKeysEqual(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }
    return this.props.children;
  }
}
