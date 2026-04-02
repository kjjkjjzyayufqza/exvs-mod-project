import { createContext, useContext, type ReactNode } from "react";

/**
 * Which sidebar route is currently visible (foreground). Kept-alive routes that are
 * hidden remain mounted but are not "active" for heavy UI work.
 */
export type KeepAliveContextValue = {
  /** Matched sidebar URL for the current location, e.g. "/TestEditor", or null if unknown. */
  activeMatchedUrl: string | null;
};

const KeepAliveContext = createContext<KeepAliveContextValue | null>(null);

export function KeepAliveProvider({
  activeMatchedUrl,
  children,
}: {
  activeMatchedUrl: string | null;
  children: ReactNode;
}) {
  return (
    <KeepAliveContext.Provider value={{ activeMatchedUrl }}>{children}</KeepAliveContext.Provider>
  );
}

export function useKeepAliveContext(): KeepAliveContextValue {
  const ctx = useContext(KeepAliveContext);
  if (!ctx) {
    throw new Error("useKeepAliveContext must be used within KeepAliveProvider");
  }
  return ctx;
}

/**
 * True when the given sidebar route URL is the foreground page (user sees it).
 */
export function useIsKeepAliveRouteActive(routeUrl: string): boolean {
  const { activeMatchedUrl } = useKeepAliveContext();
  return activeMatchedUrl === routeUrl;
}
