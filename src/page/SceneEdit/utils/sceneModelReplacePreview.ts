import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";

export interface ModelReplacementDiskWriteResult {
  filesWritten: string[];
  modelDir: string;
  warnings: string[];
}

export interface ModelReplacementPreviewDeps {
  importAndConvert: () => Promise<{ importId: string; ssbhGenerated: boolean }>;
  buildPreviewBundle: (importId: string) => Promise<SsbhModelPreviewBundle>;
  hydratePreviewBundle: (bundle: SsbhModelPreviewBundle) => Promise<void>;
  writeToDisk?: () => Promise<ModelReplacementDiskWriteResult>;
}

export interface ModelReplacementPreviewResult {
  previewBundle: SsbhModelPreviewBundle;
  importId: string;
  wroteToDisk: boolean;
  diskResult?: ModelReplacementDiskWriteResult;
}

/**
 * Out-of-scene replace: convert/write on disk only, then load the slot bundle from paths
 * (no session import or large IPC preview payload).
 */
export async function runModelReplacementDirectToDisk(deps: {
  writeToDisk: () => Promise<ModelReplacementDiskWriteResult>;
  loadBundleFromDisk: () => Promise<SsbhModelPreviewBundle>;
  hydratePreviewBundle: (bundle: SsbhModelPreviewBundle) => Promise<void>;
}): Promise<ModelReplacementPreviewResult> {
  const diskResult = await deps.writeToDisk();
  const previewBundle = await deps.loadBundleFromDisk();
  await deps.hydratePreviewBundle(previewBundle);
  return {
    previewBundle,
    importId: "",
    wroteToDisk: true,
    diskResult,
  };
}

/**
 * Session import → preview bundle → hydrate (required for viewport) → optional disk write.
 * Keeps replace preview behavior testable and prevents invisible models after replace.
 */
export async function runModelReplacementPreview(
  deps: ModelReplacementPreviewDeps,
): Promise<ModelReplacementPreviewResult> {
  const result = await deps.importAndConvert();
  if (!result.ssbhGenerated) {
    throw new Error("SSBH conversion did not produce in-memory artifacts");
  }

  const previewBundle = await deps.buildPreviewBundle(result.importId);
  await deps.hydratePreviewBundle(previewBundle);

  if (deps.writeToDisk) {
    const diskResult = await deps.writeToDisk();
    return {
      previewBundle,
      importId: result.importId,
      wroteToDisk: true,
      diskResult,
    };
  }

  return {
    previewBundle,
    importId: result.importId,
    wroteToDisk: false,
  };
}
