import { useEffect, useRef } from "react";

import { useConfigStore } from "@/store/configStore";

import { useSsbhModelPreview } from "./SsbhModelPreviewPanel";

/**
 * Mirrors Unit Model Editor preview render style to settings.json and applies
 * persisted value when the config store hydrates or changes externally.
 */
export function usePersistUnitModelPreviewRenderStyle(): void {
  const { previewRenderStyle, setPreviewRenderStyle } = useSsbhModelPreview();
  const persisted = useConfigStore((state) => state.unitModelPreviewRenderStyle);
  const setPersisted = useConfigStore((state) => state.setUnitModelPreviewRenderStyle);
  const lastAppliedPersistedRef = useRef(persisted);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    if (persisted === lastAppliedPersistedRef.current) {
      return;
    }
    lastAppliedPersistedRef.current = persisted;
    skipNextPersistRef.current = true;
    setPreviewRenderStyle(persisted);
  }, [persisted, setPreviewRenderStyle]);

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
