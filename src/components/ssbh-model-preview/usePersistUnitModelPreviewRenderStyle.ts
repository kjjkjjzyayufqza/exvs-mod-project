import { useEffect, useRef } from "react";

import { useConfigStore } from "@/store/configStore";

import type { PreviewRenderStyle } from "./SsbhModelPreviewContext";
import { useSsbhModelPreview } from "./SsbhModelPreviewPanel";

/**
 * True when a store value still has to be copied onto the live viewport.
 *
 * `lastAppliedPersisted` starts null so the first paint can apply a preset the
 * provider did not capture (its useState only reads the prop once, and the
 * parameter fallback is "standard"). A later viewport edit keeps the same store
 * value, so this stays false and the edit is not overwritten.
 */
export function persistedPreviewRenderStyleNeedsApply(
  lastAppliedPersisted: PreviewRenderStyle | null,
  persisted: PreviewRenderStyle,
  live: PreviewRenderStyle,
): boolean {
  if (lastAppliedPersisted === persisted) return false;
  return live !== persisted;
}

/**
 * Mirrors Unit Model Editor preview render style to settings.json and applies
 * the persisted value when the config store hydrates or changes externally.
 */
export function usePersistUnitModelPreviewRenderStyle(): void {
  const { previewRenderStyle, setPreviewRenderStyle } = useSsbhModelPreview();
  const persisted = useConfigStore((state) => state.unitModelPreviewRenderStyle);
  const setPersisted = useConfigStore((state) => state.setUnitModelPreviewRenderStyle);
  const lastAppliedPersistedRef = useRef<PreviewRenderStyle | null>(null);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    const needsApply = persistedPreviewRenderStyleNeedsApply(
      lastAppliedPersistedRef.current,
      persisted,
      previewRenderStyle,
    );
    lastAppliedPersistedRef.current = persisted;
    if (!needsApply) return;
    skipNextPersistRef.current = true;
    setPreviewRenderStyle(persisted);
  }, [persisted, previewRenderStyle, setPreviewRenderStyle]);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (previewRenderStyle === persisted) {
      return;
    }
    void setPersisted(previewRenderStyle);
  }, [previewRenderStyle, persisted, setPersisted]);
}
