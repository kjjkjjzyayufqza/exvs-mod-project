import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { MatlDataJson } from "@/page/TestEditor/components/ssbh-model-preview/types";
import { createEmptyNumatbFile } from "@/page/TestEditor/components/ssbh-model-preview/daeSsbhTypes";

/** Per-object texture slot override: maps paramId → nutexb path */
export type TextureSlotOverrides = Record<string, string>;

export interface SceneAssetConfig {
  assetId: string;
  parentAssetId: string | null;
  sourceType: "ssbh" | "imported-dae";
  sourcePath: string | null;
  outputDir: string | null;
  numatbMaya: MatlDataJson;
  numatbNust: MatlDataJson;
  textureOverrides: TextureSlotOverrides;
  lastConvertedAt: string | null;
}

interface SceneAssetState {
  assets: Record<string, SceneAssetConfig>;
}

interface SceneAssetActions {
  registerAsset: (assetId: string, config: Partial<SceneAssetConfig>) => void;
  removeAsset: (assetId: string) => void;
  cloneAsset: (sourceId: string, newId: string) => void;

  setNumatb: (assetId: string, profile: "maya" | "nust", data: MatlDataJson) => void;
  setTextureSlot: (assetId: string, paramId: string, nutexbPath: string) => void;
  removeTextureSlot: (assetId: string, paramId: string) => void;
  setSourcePath: (assetId: string, path: string | null) => void;
  setOutputDir: (assetId: string, dir: string | null) => void;
  markConverted: (assetId: string) => void;

  /** Propagate parent numatb/texture changes to all children that haven't overridden */
  propagateFromParent: (parentId: string) => void;

  /** Get resolved config (inheriting from parent where not overridden) */
  getResolvedConfig: (assetId: string) => SceneAssetConfig | null;

  /** Get all children of a given parent */
  getChildren: (parentId: string) => string[];

  resetAll: () => void;
}

function createDefaultAssetConfig(assetId: string): SceneAssetConfig {
  return {
    assetId,
    parentAssetId: null,
    sourceType: "ssbh",
    sourcePath: null,
    outputDir: null,
    numatbMaya: createEmptyNumatbFile(),
    numatbNust: createEmptyNumatbFile(),
    textureOverrides: {},
    lastConvertedAt: null,
  };
}

export const useSceneAssetStore = create<SceneAssetState & SceneAssetActions>()(
  immer((set, get) => ({
    assets: {},

    registerAsset: (assetId, config) => {
      set((state) => {
        state.assets[assetId] = {
          ...createDefaultAssetConfig(assetId),
          ...config,
          assetId,
        };
      });
    },

    removeAsset: (assetId) => {
      set((state) => {
        delete state.assets[assetId];
        // Orphan children (set parentAssetId to null)
        for (const asset of Object.values(state.assets)) {
          if (asset.parentAssetId === assetId) {
            asset.parentAssetId = null;
          }
        }
      });
    },

    cloneAsset: (sourceId, newId) => {
      set((state) => {
        const source = state.assets[sourceId];
        if (!source) return;
        state.assets[newId] = {
          ...structuredClone(source),
          assetId: newId,
          parentAssetId: sourceId,
          lastConvertedAt: null,
        };
      });
    },

    setNumatb: (assetId, profile, data) => {
      set((state) => {
        const asset = state.assets[assetId];
        if (!asset) return;
        if (profile === "maya") {
          asset.numatbMaya = data;
        } else {
          asset.numatbNust = data;
        }
      });
    },

    setTextureSlot: (assetId, paramId, nutexbPath) => {
      set((state) => {
        const asset = state.assets[assetId];
        if (!asset) return;
        asset.textureOverrides[paramId] = nutexbPath;
      });
    },

    removeTextureSlot: (assetId, paramId) => {
      set((state) => {
        const asset = state.assets[assetId];
        if (!asset) return;
        delete asset.textureOverrides[paramId];
      });
    },

    setSourcePath: (assetId, path) => {
      set((state) => {
        const asset = state.assets[assetId];
        if (!asset) return;
        asset.sourcePath = path;
      });
    },

    setOutputDir: (assetId, dir) => {
      set((state) => {
        const asset = state.assets[assetId];
        if (!asset) return;
        asset.outputDir = dir;
      });
    },

    markConverted: (assetId) => {
      set((state) => {
        const asset = state.assets[assetId];
        if (!asset) return;
        asset.lastConvertedAt = new Date().toISOString();
      });
    },

    propagateFromParent: (parentId) => {
      const state = get();
      const parent = state.assets[parentId];
      if (!parent) return;

      set((draft) => {
        for (const asset of Object.values(draft.assets)) {
          if (asset.parentAssetId !== parentId) continue;
          // Inherit numatb profiles from parent
          asset.numatbMaya = structuredClone(parent.numatbMaya);
          asset.numatbNust = structuredClone(parent.numatbNust);
          // Inherit texture overrides from parent (merge, parent wins for shared keys)
          asset.textureOverrides = {
            ...structuredClone(parent.textureOverrides),
            ...asset.textureOverrides,
          };
        }
      });
    },

    getResolvedConfig: (assetId) => {
      const state = get();
      const asset = state.assets[assetId];
      if (!asset) return null;
      if (!asset.parentAssetId) return asset;

      const parent = state.assets[asset.parentAssetId];
      if (!parent) return asset;

      // Merge: asset's own values override parent's
      return {
        ...asset,
        numatbMaya: asset.numatbMaya.entries.length > 0 ? asset.numatbMaya : parent.numatbMaya,
        numatbNust: asset.numatbNust.entries.length > 0 ? asset.numatbNust : parent.numatbNust,
        textureOverrides: { ...parent.textureOverrides, ...asset.textureOverrides },
      };
    },

    getChildren: (parentId) => {
      const state = get();
      return Object.values(state.assets)
        .filter((a) => a.parentAssetId === parentId)
        .map((a) => a.assetId);
    },

    resetAll: () => {
      set((state) => {
        state.assets = {};
      });
    },
  })),
);
