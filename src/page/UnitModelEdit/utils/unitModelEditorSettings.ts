export const UNIT_MODEL_EDIT_PANEL_IDS = [
  "unit-model-hierarchy",
  "unit-model-viewport",
  "unit-model-properties",
] as const;

export const UNIT_MODEL_EDIT_DEFAULT_LAYOUT: Record<
  (typeof UNIT_MODEL_EDIT_PANEL_IDS)[number],
  number
> = {
  "unit-model-hierarchy": 20,
  "unit-model-viewport": 60,
  "unit-model-properties": 20,
};

export const UNIT_MODEL_EDIT_RND_SIZE_KEYS = {
  daeExchange: "unit-model-edit.rnd-size.dae-exchange",
} as const;

/** Tauri store keys under `dialogDefaultPath` — one per Unit Model Editor file/folder dialog. */
export const UNIT_MODEL_OPEN_FOLDER_DIALOG_PATH_KEY = "unitModelEdit.openFolder";
export const UNIT_MODEL_EXTRACT_SOURCE_DIALOG_PATH_KEY = "unitModelEdit.extractFhm2dSource";
export const UNIT_MODEL_EXTRACT_OUTPUT_DIALOG_PATH_KEY = "unitModelEdit.extractFhm2dOutput";
export const UNIT_MODEL_ADD_SSBH_FOLDER_DIALOG_PATH_KEY = "unitModelEdit.addSsbhFolder";
export const UNIT_MODEL_REPLACE_SSBH_FOLDER_DIALOG_PATH_KEY = "unitModelEdit.replaceSsbhFolder";
export const UNIT_MODEL_IMPORT_STATIC_MESH_DIALOG_PATH_KEY = "unitModelEdit.importStaticMesh";
export const UNIT_MODEL_ADD_TEXTURE_DIALOG_PATH_KEY = "unitModelEdit.addTexture";
export const UNIT_MODEL_REPLACE_TEXTURE_DIALOG_PATH_KEY = "unitModelEdit.replaceTexture";
export const UNIT_MODEL_BATCH_EXPORT_TEXTURES_DIALOG_PATH_KEY = "unitModelEdit.batchExportTextures";
export const UNIT_MODEL_EXPORT_TEXTURE_DIALOG_PATH_KEY = "unitModelEdit.exportTexture";
export const UNIT_MODEL_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY = "unitModelEdit.exportDaeFolder";

/** Config setting for the preferred unit-model extract/output root (not a dialog-only key). */
export const UNIT_MODEL_OUTPUT_PATH_SETTING_KEY = "unitModelOutputPath";

export type UnitModelEditRndSizeStorageKey =
  (typeof UNIT_MODEL_EDIT_RND_SIZE_KEYS)[keyof typeof UNIT_MODEL_EDIT_RND_SIZE_KEYS];

export const UNIT_MODEL_HIERARCHY_TABS_LIST =
  "shrink-0 grid h-8 w-full grid-cols-2 gap-0 rounded-none border-b bg-muted/30 p-0";

export const UNIT_MODEL_HIERARCHY_TAB_BADGE =
  "ml-0.5 inline-block min-w-[1rem] text-center text-[8px] font-mono leading-none opacity-60";

export const UNIT_MODEL_HIERARCHY_TAB_TRIGGER =
  "h-8 rounded-none border-b-2 border-transparent px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";
