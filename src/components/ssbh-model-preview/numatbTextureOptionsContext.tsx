import { createContext, useContext, type ReactNode } from "react";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";

/**
 * Texture suggestions for the NUMATB texture-path picker (`SceneTextureSelectPicker`).
 *
 * The picker defaults to the global Scene Editor texture-manager store, which the
 * Scene Editor fills from the open stage. Hosts that are not the Scene Editor — the
 * Unit Model Editor's DAE/FBX to SSBH flows — inject their own package textures here
 * so the dropdown lists the right nutexb pool without writing to (and contaminating)
 * the shared Scene Editor store.
 */
export interface NumatbTextureOptions {
  entries: TextureManagerEntry[];
  recentEntryIds: string[];
}

const NumatbTextureOptionsContext = createContext<NumatbTextureOptions | null>(null);

export function NumatbTextureOptionsProvider({
  value,
  children,
}: {
  value: NumatbTextureOptions | null;
  children: ReactNode;
}) {
  return (
    <NumatbTextureOptionsContext.Provider value={value}>{children}</NumatbTextureOptionsContext.Provider>
  );
}

/** Returns the host-provided texture suggestions, or null to fall back to the Scene Editor store. */
export function useNumatbTextureOptionsOverride(): NumatbTextureOptions | null {
  return useContext(NumatbTextureOptionsContext);
}
