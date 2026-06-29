import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMainViewTabNavCollapsed,
  rememberMainViewTabNavCollapsed,
} from "./mainViewTabNavSettings";

export function useMainViewTabNavCollapsed() {
  const [collapsed, setCollapsedState] = useState(false);
  const hydratedRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getMainViewTabNavCollapsed();
      if (cancelled) return;
      hydratedRef.current = true;
      setCollapsedState(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    if (!hydratedRef.current) return;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      void rememberMainViewTabNavCollapsed(next);
    }, 150);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      if (hydratedRef.current) {
        if (persistTimerRef.current) {
          clearTimeout(persistTimerRef.current);
        }
        persistTimerRef.current = setTimeout(() => {
          void rememberMainViewTabNavCollapsed(next);
        }, 150);
      }
      return next;
    });
  }, []);

  return {
    collapsed,
    setCollapsed,
    toggleCollapsed,
  };
}
