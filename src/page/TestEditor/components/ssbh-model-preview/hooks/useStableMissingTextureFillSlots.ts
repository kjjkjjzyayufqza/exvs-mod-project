import { useEffect, useMemo, useState } from "react";
import type { MatlDataJson } from "../daeSsbhTypes";
import {
  missingTexturePathSlotKey,
  resolveTexturePathValueForSlot,
  type MissingTexturePathSlotRef,
} from "../store/numatbTemplateStoreHelpers";

/**
 * Keeps missing-texture fill rows visible while the user edits paths in the current model session.
 * Rows are only cleared when `resetKey` changes (e.g. another DAE file / analysis), not when a path is filled.
 */
export function useStableMissingTextureFillSlots(
  resetKey: string,
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  liveMissing: MissingTexturePathSlotRef[],
): MissingTexturePathSlotRef[] {
  const [stableSlots, setStableSlots] = useState<MissingTexturePathSlotRef[]>([]);

  useEffect(() => {
    setStableSlots([]);
  }, [resetKey]);

  useEffect(() => {
    setStableSlots((previous) => {
      const merged = new Map(previous.map((slot) => [missingTexturePathSlotKey(slot), slot]));
      for (const slot of liveMissing) {
        merged.set(missingTexturePathSlotKey(slot), slot);
      }
      return Array.from(merged.values());
    });
  }, [liveMissing]);

  return useMemo(
    () =>
      stableSlots.map((slot) => ({
        ...slot,
        value: resolveTexturePathValueForSlot(mayaFile, nustFile, slot),
      })),
    [stableSlots, mayaFile, nustFile],
  );
}
