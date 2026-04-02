import { useCallback, useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FolderChangePayload } from "../types";

const WATCH_EVENT = "test-editor:folder-change";

type Params = {
  isPageActive: boolean;
  onFlush: (queued: FolderChangePayload[]) => void;
};

/**
 * Buffers folder-change payloads from Tauri. While the route is inactive, payloads accumulate
 * without scheduling UI work; when the page becomes active again, pending payloads flush once.
 */
export function useTestEditorFolderWatch({ isPageActive, onFlush }: Params): void {
  const pendingPayloadsRef = useRef<FolderChangePayload[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const pageActiveRef = useRef(isPageActive);
  pageActiveRef.current = isPageActive;

  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const flushPendingPayloads = useCallback(() => {
    const queued = pendingPayloadsRef.current;
    pendingPayloadsRef.current = [];
    rafIdRef.current = null;
    if (!queued.length) return;
    onFlushRef.current(queued);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setup = async () => {
      unlisten = await listen<FolderChangePayload>(WATCH_EVENT, (event) => {
        pendingPayloadsRef.current.push(event.payload);
        if (!pageActiveRef.current) return;
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(flushPendingPayloads);
        }
      });
    };

    void setup();

    return () => {
      unlisten?.();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingPayloadsRef.current = [];
    };
  }, [flushPendingPayloads]);

  useEffect(() => {
    if (!isPageActive) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }
    if (pendingPayloadsRef.current.length > 0 && rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushPendingPayloads);
    }
  }, [isPageActive, flushPendingPayloads]);
}
