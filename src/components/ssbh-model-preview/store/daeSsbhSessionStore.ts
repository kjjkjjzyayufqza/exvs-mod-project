import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { toast } from "sonner";
import {
  createEmptyNumatbFile,
  type DaeImportKind,
  type DaeSsbhConvertExtendedResult,
  type DaeSsbhSessionState,
  type MatlDataJson,
  type NumatbAttributeData,
  type NumatbAttributeDataKind,
  type NumatbProfileKind,
  type NumatbTemplateDefinition,
  type NumatbTemplateLibrary,
  type NumdlbMappingRow,
} from "../daeSsbhTypes";
import { flattenEntryToAttributes } from "./matlEntryFlat";
import { normalizeMatlDataJson } from "./numatbProfileMigration";
import type { SsbhDaeAnalysisReport, SsbhDaeUpAxis } from "../ssbhDaeIoService";
import { getExvsDefaultMayaProfileTemplate, getExvsDefaultNustProfileTemplate } from "../exvsEmbeddedProfileTemplates";
import {
  deleteNumatbTemplate,
  loadNumatbTemplateLibrary,
  upsertNumatbTemplate,
} from "./daeSsbhTemplateLibrary";
import {
  addEntryAttribute,
  addMaterialEntry,
  cloneProfile,
  ensureMissingMappingLabelsInProfiles,
  isTexturePathParamId,
  mirrorTexturePathOntoOtherProfile,
  removeEntryAttribute,
  removeMaterialEntry,
  updateEntryAttribute,
  updateMaterialLabel,
  updateShaderLabel,
} from "./numatbTemplateStoreHelpers";

type DaeSsbhSessionActions = {
  resetSession: () => void;
  setImportKind: (kind: DaeImportKind) => void;
  setSourcePath: (path: string | null) => void;
  loadAnalysis: (analysis: SsbhDaeAnalysisReport, options?: { resetMaterialProfiles?: boolean }) => void;
  setGeometryEnabled: (name: string, enabled: boolean) => void;
  setOutputDir: (outputDir: string | null) => void;
  setOutputBaseName: (value: string) => void;
  setScaleFactorText: (value: string) => void;
  setUpAxis: (value: SsbhDaeUpAxis) => void;
  setFlipUv: (value: boolean) => void;
  setWriteLog: (value: boolean) => void;
  setWriteNumdlb: (value: boolean) => void;
  setWriteNumshb: (value: boolean) => void;
  setWriteNusktb: (value: boolean) => void;
  setWriteNumatb: (value: boolean) => void;
  setWriteMayaProfile: (value: boolean) => void;
  setMirrorTexturePathsAcrossProfiles: (value: boolean) => void;
  setMaterialLabel: (rowIndex: number, nextLabel: string) => void;
  replaceAllMaterialLabels: (nextLabel: string, rowIndices: number[]) => void;
  updateProfileMaterialLabel: (profile: NumatbProfileKind, materialIndex: number, nextLabel: string) => void;
  updateProfileShaderLabel: (profile: NumatbProfileKind, materialIndex: number, nextShaderLabel: string) => void;
  updateProfileAttribute: (
    profile: NumatbProfileKind,
    materialIndex: number,
    attributeIndex: number,
    data: NumatbAttributeData,
  ) => void;
  addProfileAttribute: (
    profile: NumatbProfileKind,
    materialIndex: number,
    paramId: string,
    kind?: NumatbAttributeDataKind,
  ) => void;
  removeProfileAttribute: (profile: NumatbProfileKind, materialIndex: number, attributeIndex: number) => void;
  addProfileMaterialEntry: (profile: NumatbProfileKind, materialLabel: string) => void;
  removeProfileMaterialEntry: (profile: NumatbProfileKind, materialIndex: number) => void;
  setProfileFile: (profile: NumatbProfileKind, file: MatlDataJson) => void;
  setLastResult: (result: DaeSsbhConvertExtendedResult | null) => void;
  loadTemplateLibrary: () => Promise<void>;
  saveCurrentAsTemplate: (payload: { name: string; description: string; sourceFileName?: string | null }) => Promise<void>;
  deleteTemplateById: (templateId: string) => Promise<void>;
  applyTemplateById: (templateId: string) => void;
};

type DaeSsbhTemplateState = {
  templateLibrary: NumatbTemplateLibrary;
  templatesLoading: boolean;
  templateLibraryError: string | null;
};

export type DaeSsbhSessionStoreState = DaeSsbhSessionState & DaeSsbhTemplateState & DaeSsbhSessionActions;

const SESSION_STORAGE_KEY = "ssbh-dae-session-v2";
const SESSION_VERSION = 6;

export function buildAnalysisLoadKey(
  sourcePath: string | null,
  geometryNames: readonly string[],
): string | null {
  if (!sourcePath) {
    return null;
  }
  return `${sourcePath}\0${geometryNames.join("\u0001")}`;
}

export function shouldPreserveMaterialProfilesOnAnalysisLoad(
  state: Pick<DaeSsbhSessionState, "loadedAnalysisKey" | "mayaFile">,
  analysisKey: string | null,
  resetMaterialProfiles?: boolean,
): boolean {
  return (
    !resetMaterialProfiles &&
    analysisKey !== null &&
    state.loadedAnalysisKey === analysisKey &&
    state.mayaFile.entries.length > 0
  );
}

export function normalizeAnalysisUpAxis(value: string): SsbhDaeUpAxis | null {
  switch (value.trim().toLowerCase()) {
    case "y_up":
    case "y-up":
    case "yup":
      return "y_up";
    case "z_up":
    case "z-up":
    case "zup":
      return "z_up";
    case "none":
    case "no_conversion":
    case "noconversion":
      return "none";
    default:
      return null;
  }
}

function buildInitialState(): DaeSsbhSessionState {
  return {
    sessionVersion: SESSION_VERSION,
    importKind: "dae",
    sourcePath: null,
    loadedAnalysisKey: null,
    analysis: null,
    includeGeometryNames: [],
    outputDir: null,
    outputBaseName: "model",
    scaleFactorText: "1",
    upAxis: "y_up",
    flipUv: false,
    writeLog: false,
    writeNumdlb: true,
    writeNumshb: true,
    writeNusktb: true,
    writeNumatb: true,
    writeMayaProfile: true,
    mirrorTexturePathsAcrossProfiles: true,
    numdlbEntries: [],
    selectedTemplateId: null,
    numatbProfileReplacementRevision: 0,
    mayaFile: createEmptyNumatbFile(),
    nustFile: createEmptyNumatbFile(),
    lastResult: null,
  };
}

const DEFAULT_MESH_MATERIAL_LABEL = "pbr1Mtl";

function getMostCommonLabel(rows: NumdlbMappingRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.materialLabel, (counts.get(row.materialLabel) ?? 0) + 1);
  }
  let maxLabel = DEFAULT_MESH_MATERIAL_LABEL;
  let maxCount = 0;
  for (const [label, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxLabel = label;
    }
  }
  return maxLabel;
}

function createRowsFromAnalysis(analysis: SsbhDaeAnalysisReport, previousRows?: NumdlbMappingRow[]): NumdlbMappingRow[] {
  const lastLabel = previousRows && previousRows.length > 0
    ? getMostCommonLabel(previousRows)
    : DEFAULT_MESH_MATERIAL_LABEL;
  return analysis.geometryNames.map((name) => ({
    meshObjectName: name,
    meshObjectSubindex: 0,
    materialLabel: lastLabel,
  }));
}

function createTemplateFromState(
  state: DaeSsbhSessionStoreState,
  payload: { name: string; description: string; sourceFileName?: string | null },
): NumatbTemplateDefinition {
  return {
    id: crypto.randomUUID(),
    name: payload.name.trim(),
    description: payload.description.trim(),
    sourceFileName: payload.sourceFileName?.trim() || null,
    updatedAt: new Date().toISOString(),
    mayaFile: cloneProfile(state.mayaFile),
    nustFile: cloneProfile(state.nustFile),
  };
}

function createDebouncedStorage(base: StateStorage, delayMs: number): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  let pendingKey: string | null = null;
  return {
    getItem: (name) => base.getItem(name),
    setItem: (name, value) => {
      pending = value;
      pendingKey = name;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (pending !== null && pendingKey !== null) {
          base.setItem(pendingKey, pending);
          pending = null;
          pendingKey = null;
        }
      }, delayMs);
    },
    removeItem: (name) => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        pending = null;
        pendingKey = null;
      }
      base.removeItem(name);
    },
  };
}

const debouncedLocalStorage = createDebouncedStorage(localStorage, 500);

export const useDaeSsbhSessionStore = create<DaeSsbhSessionStoreState>()(
  persist(
    (set, get) => ({
      ...buildInitialState(),
      templateLibrary: { version: 1, templates: [] },
      templatesLoading: false,
      templateLibraryError: null,

      resetSession: () => {
        set((state) => ({
          ...buildInitialState(),
          numatbProfileReplacementRevision:
            (state.numatbProfileReplacementRevision ?? 0) + 1,
          templateLibrary: state.templateLibrary,
          templatesLoading: state.templatesLoading,
          templateLibraryError: state.templateLibraryError,
        }));
      },

      setImportKind: (importKind) => set({ importKind }),
      setSourcePath: (sourcePath) => set({ sourcePath }),
      setOutputDir: (outputDir) => set({ outputDir }),
      setOutputBaseName: (outputBaseName) => set({ outputBaseName }),
      setScaleFactorText: (scaleFactorText) => set({ scaleFactorText }),
      setUpAxis: (upAxis) => set({ upAxis }),
      setFlipUv: (flipUv) => set({ flipUv }),
      setWriteLog: (writeLog) => set({ writeLog }),
      setWriteNumdlb: (writeNumdlb) =>
        set((state) => ({
          writeNumdlb,
          writeNumshb: writeNumdlb ? true : state.writeNumshb,
          writeNusktb: writeNumdlb ? true : state.writeNusktb,
        })),
      setWriteNumshb: (writeNumshb) => set({ writeNumshb }),
      setWriteNusktb: (writeNusktb) => set({ writeNusktb }),
      setWriteNumatb: (writeNumatb) => set({ writeNumatb }),
      setWriteMayaProfile: (writeMayaProfile) => set({ writeMayaProfile }),
      setMirrorTexturePathsAcrossProfiles: (mirrorTexturePathsAcrossProfiles) => set({ mirrorTexturePathsAcrossProfiles }),

      loadAnalysis: (analysis, options) => {
        const state = get();
        const analysisKey = buildAnalysisLoadKey(state.sourcePath, analysis.geometryNames);
        const preserveProfiles = shouldPreserveMaterialProfilesOnAnalysisLoad(
          state,
          analysisKey,
          options?.resetMaterialProfiles,
        );
        const rows = createRowsFromAnalysis(
          analysis,
          preserveProfiles ? state.numdlbEntries : undefined,
        );
        const baseMaya = preserveProfiles ? state.mayaFile : getExvsDefaultMayaProfileTemplate();
        const baseNust = preserveProfiles ? state.nustFile : getExvsDefaultNustProfileTemplate();
        const ensured = ensureMissingMappingLabelsInProfiles(baseMaya, baseNust, rows);
        const analysisUpAxis = normalizeAnalysisUpAxis(analysis.upAxis);
        set({
          analysis,
          loadedAnalysisKey: analysisKey,
          includeGeometryNames: [...analysis.geometryNames],
          upAxis: analysisUpAxis ?? state.upAxis,
          numdlbEntries: rows,
          mayaFile: ensured.mayaFile,
          nustFile: ensured.nustFile,
          selectedTemplateId: preserveProfiles ? state.selectedTemplateId : null,
          numatbProfileReplacementRevision:
            (state.numatbProfileReplacementRevision ?? 0) + (preserveProfiles ? 0 : 1),
          lastResult: null,
        });
      },

      setGeometryEnabled: (name, enabled) => {
        set((state) => {
          const next = new Set(state.includeGeometryNames);
          if (enabled) {
            next.add(name);
          } else {
            next.delete(name);
          }
          return {
            includeGeometryNames: Array.from(next),
          };
        });
      },

      setMaterialLabel: (rowIndex, nextLabel) => {
        set((state) => {
          const rows = state.numdlbEntries.map((row, index) => (index === rowIndex ? { ...row, materialLabel: nextLabel } : row));
          const ensured = ensureMissingMappingLabelsInProfiles(state.mayaFile, state.nustFile, rows);
          return {
            numdlbEntries: rows,
            mayaFile: ensured.mayaFile,
            nustFile: ensured.nustFile,
          };
        });
      },

      replaceAllMaterialLabels: (nextLabel, rowIndices) => {
        const trimmed = nextLabel.trim();
        if (!trimmed) {
          throw new Error("replaceAllMaterialLabels: nextLabel must be non-empty");
        }
        if (rowIndices.length === 0) {
          throw new Error("replaceAllMaterialLabels: rowIndices must not be empty");
        }
        const indexSet = new Set(rowIndices);
        set((state) => {
          const rows = state.numdlbEntries.map((row, index) =>
            indexSet.has(index) ? { ...row, materialLabel: trimmed } : row,
          );
          const ensured = ensureMissingMappingLabelsInProfiles(state.mayaFile, state.nustFile, rows);
          return {
            numdlbEntries: rows,
            mayaFile: ensured.mayaFile,
            nustFile: ensured.nustFile,
          };
        });
      },

      updateProfileMaterialLabel: (profile, materialIndex, nextLabel) => {
        set((state) => {
          const file = profile === "maya" ? state.mayaFile : state.nustFile;
          const nextFile = updateMaterialLabel(file, materialIndex, nextLabel);
          return profile === "maya" ? { mayaFile: nextFile } : { nustFile: nextFile };
        });
      },

      updateProfileShaderLabel: (profile, materialIndex, nextShaderLabel) => {
        set((state) => {
          const file = profile === "maya" ? state.mayaFile : state.nustFile;
          const nextFile = updateShaderLabel(file, materialIndex, nextShaderLabel);
          return profile === "maya" ? { mayaFile: nextFile } : { nustFile: nextFile };
        });
      },

      updateProfileAttribute: (profile, materialIndex, attributeIndex, data) => {
        set((state) => {
          const sourceFile = profile === "maya" ? state.mayaFile : state.nustFile;
          const entry = sourceFile.entries[materialIndex];
          if (!entry) {
            throw new Error("Material index is out of range");
          }
          const flatAttrs = flattenEntryToAttributes(entry);
          if (!flatAttrs[attributeIndex]) {
            throw new Error("Attribute index is out of range");
          }
          const paramId = flatAttrs[attributeIndex].param_id;
          const materialLabel = entry.material_label;

          let nextMaya =
            profile === "maya" ? updateEntryAttribute(state.mayaFile, materialIndex, attributeIndex, data) : state.mayaFile;
          let nextNust =
            profile === "nust" ? updateEntryAttribute(state.nustFile, materialIndex, attributeIndex, data) : state.nustFile;

          if (state.mirrorTexturePathsAcrossProfiles && isTexturePathParamId(paramId) && !paramId.startsWith("Use")) {
            if (profile === "maya") {
              nextNust = mirrorTexturePathOntoOtherProfile(nextNust, materialLabel, paramId, data);
            } else {
              nextMaya = mirrorTexturePathOntoOtherProfile(nextMaya, materialLabel, paramId, data);
            }
          }

          return { mayaFile: nextMaya, nustFile: nextNust };
        });
      },

      addProfileAttribute: (profile, materialIndex, paramId, kind) => {
        set((state) => {
          const file = profile === "maya" ? state.mayaFile : state.nustFile;
          const nextFile = addEntryAttribute(file, materialIndex, paramId, kind);
          return profile === "maya" ? { mayaFile: nextFile } : { nustFile: nextFile };
        });
      },

      removeProfileAttribute: (profile, materialIndex, attributeIndex) => {
        set((state) => {
          const file = profile === "maya" ? state.mayaFile : state.nustFile;
          const nextFile = removeEntryAttribute(file, materialIndex, attributeIndex);
          return profile === "maya" ? { mayaFile: nextFile } : { nustFile: nextFile };
        });
      },

      addProfileMaterialEntry: (profile, materialLabel) => {
        set((state) => {
          const file = profile === "maya" ? state.mayaFile : state.nustFile;
          const nextFile = addMaterialEntry(file, materialLabel, profile);
          return profile === "maya" ? { mayaFile: nextFile } : { nustFile: nextFile };
        });
      },

      removeProfileMaterialEntry: (profile, materialIndex) => {
        set((state) => {
          const file = profile === "maya" ? state.mayaFile : state.nustFile;
          const nextFile = removeMaterialEntry(file, materialIndex);
          return profile === "maya" ? { mayaFile: nextFile } : { nustFile: nextFile };
        });
      },

      setProfileFile: (profile, file) => {
        set((state) => {
          const normalized = normalizeMatlDataJson(file);
          const maya = profile === "maya" ? normalized : state.mayaFile;
          const nust = profile === "nust" ? normalized : state.nustFile;
          const ensured = ensureMissingMappingLabelsInProfiles(maya, nust, state.numdlbEntries);
          return {
            mayaFile: ensured.mayaFile,
            nustFile: ensured.nustFile,
            numatbProfileReplacementRevision:
              (state.numatbProfileReplacementRevision ?? 0) + 1,
          };
        });
      },

      setLastResult: (lastResult) => set({ lastResult }),

      loadTemplateLibrary: async () => {
        set({ templatesLoading: true, templateLibraryError: null });
        try {
          const templateLibrary = await loadNumatbTemplateLibrary();
          const selectedTemplateId = get().selectedTemplateId;
          set({
            templateLibrary,
            templatesLoading: false,
            selectedTemplateId:
              selectedTemplateId && templateLibrary.templates.some((template) => template.id === selectedTemplateId)
                ? selectedTemplateId
                : null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ templateLibraryError: message, templatesLoading: false });
          toast.error(`Failed to load numatb templates: ${message}`);
        }
      },

      saveCurrentAsTemplate: async (payload) => {
        const state = get();
        const name = payload.name.trim();
        if (!name) {
          throw new Error("Template name is required");
        }
        const template = createTemplateFromState(state, payload);
        const templateLibrary = await upsertNumatbTemplate(template);
        set({
          templateLibrary,
          selectedTemplateId: template.id,
          templateLibraryError: null,
        });
      },

      deleteTemplateById: async (templateId) => {
        const templateLibrary = await deleteNumatbTemplate(templateId);
        set((state) => ({
          templateLibrary,
          selectedTemplateId: state.selectedTemplateId === templateId ? null : state.selectedTemplateId,
          templateLibraryError: null,
        }));
      },

      applyTemplateById: (templateId) => {
        const state = get();
        const template = state.templateLibrary.templates.find((item) => item.id === templateId);
        if (!template) {
          throw new Error("Template not found");
        }
        const mayaFile = cloneProfile(template.mayaFile);
        const nustFile = cloneProfile(template.nustFile);
        const ensured = ensureMissingMappingLabelsInProfiles(mayaFile, nustFile, state.numdlbEntries);
        set({
          selectedTemplateId: templateId,
          mayaFile: ensured.mayaFile,
          nustFile: ensured.nustFile,
          numatbProfileReplacementRevision:
            (state.numatbProfileReplacementRevision ?? 0) + 1,
        });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: SESSION_VERSION,
      storage: createJSONStorage(() => debouncedLocalStorage),
      partialize: (state) => ({
        sessionVersion: state.sessionVersion,
        importKind: state.importKind,
        outputDir: state.outputDir,
        outputBaseName: state.outputBaseName,
        scaleFactorText: state.scaleFactorText,
        upAxis: state.upAxis,
        flipUv: state.flipUv,
        writeLog: state.writeLog,
        writeNumdlb: state.writeNumdlb,
        writeNumshb: state.writeNumshb,
        writeNusktb: state.writeNusktb,
        writeNumatb: state.writeNumatb,
        writeMayaProfile: state.writeMayaProfile,
        mirrorTexturePathsAcrossProfiles: state.mirrorTexturePathsAcrossProfiles,
      }),
      migrate: (persistedState) => {
        const next = persistedState as Partial<DaeSsbhSessionState> & Record<string, unknown> | undefined;
        const base = buildInitialState();
        return {
          ...base,
          importKind: next?.importKind ?? base.importKind,
          outputDir: next?.outputDir ?? base.outputDir,
          outputBaseName: next?.outputBaseName ?? base.outputBaseName,
          scaleFactorText: next?.scaleFactorText ?? base.scaleFactorText,
          upAxis: next?.upAxis ?? base.upAxis,
          flipUv: next?.flipUv ?? base.flipUv,
          writeLog: next?.writeLog ?? base.writeLog,
          writeNumdlb: next?.writeNumdlb ?? base.writeNumdlb,
          writeNumshb: next?.writeNumshb ?? base.writeNumshb,
          writeNusktb: next?.writeNusktb ?? base.writeNusktb,
          writeNumatb: next?.writeNumatb ?? base.writeNumatb,
          writeMayaProfile: next?.writeMayaProfile ?? base.writeMayaProfile,
          mirrorTexturePathsAcrossProfiles: next?.mirrorTexturePathsAcrossProfiles ?? true,
          sessionVersion: SESSION_VERSION,
        };
      },
    },
  ),
);
