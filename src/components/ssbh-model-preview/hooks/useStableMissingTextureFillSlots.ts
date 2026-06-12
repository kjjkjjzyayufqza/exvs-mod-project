import { useEffect, useMemo, useState } from "react";
import type { MatlDataJson } from "../daeSsbhTypes";
import {
  missingTexturePathSlotKey,
  resolveTexturePathValueForSlot,
  type MissingTexturePathSlotRef,
} from "../store/numatbTemplateStoreHelpers";

/**
 * Keeps missing-texture fill rows visible while the user edits paths in the current model session.
 * Filled rows stay visible, while replaced profiles and no-longer-valid slots are removed.
 */
export function useStableMissingTextureFillSlots(
  resetKey: string,
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  currentSlots: MissingTexturePathSlotRef[],
  liveMissing: MissingTexturePathSlotRef[],
): MissingTexturePathSlotRef[] {
  const [stableSlots, setStableSlots] = useState<MissingTexturePathSlotRef[]>([]);

  useEffect(() => {
    setStableSlots([]);
  }, [resetKey]);

  useEffect(() => {
    setStableSlots((previous) => {
      const currentByKey = new Map(
        currentSlots.map((slot) => [missingTexturePathSlotKey(slot), slot]),
      );
      const merged = new Map<string, MissingTexturePathSlotRef>();
      for (const slot of previous) {
        const current = currentByKey.get(missingTexturePathSlotKey(slot));
        if (current) {
          merged.set(missingTexturePathSlotKey(current), current);
        }
      }
      for (const slot of liveMissing) {
        merged.set(missingTexturePathSlotKey(slot), slot);
      }
      return Array.from(merged.values());
    });
  }, [currentSlots, liveMissing]);

  return useMemo(
    () =>
      stableSlots.map((slot) => ({
        ...slot,
        value: resolveTexturePathValueForSlot(mayaFile, nustFile, slot),
      })),
    [stableSlots, mayaFile, nustFile],
  );
}
