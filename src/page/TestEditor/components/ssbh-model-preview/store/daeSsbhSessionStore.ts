import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
  loadAnalysis: (analysis: SsbhDaeAnalysisReport) => void;
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
const SESSION_VERSION = 5;

function buildInitialState(): DaeSsbhSessionState {
  return {
    sessionVersion: SESSION_VERSION,
    importKind: "dae",
    sourcePath: null,
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
    mayaFile: createEmptyNumatbFile(),
    nustFile: createEmptyNumatbFile(),
    lastResult: null,
  };
}

const DEFAULT_MESH_MATERIAL_LABEL = "pbr1Mtl";

function createRowsFromAnalysis(analysis: SsbhDaeAnalysisReport): NumdlbMappingRow[] {
  return analysis.geometryNames.map((name) => ({
    meshObjectName: name,
    meshObjectSubindex: 0,
    materialLabel: DEFAULT_MESH_MATERIAL_LABEL,
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

      loadAnalysis: (analysis) => {
        const rows = createRowsFromAnalysis(analysis);
        const mayaFile = getExvsDefaultMayaProfileTemplate();
        const nustFile = getExvsDefaultNustProfileTemplate();
        const ensured = ensureMissingMappingLabelsInProfiles(mayaFile, nustFile, rows);
        set({
          analysis,
          includeGeometryNames: [...analysis.geometryNames],
          numdlbEntries: rows,
          outputBaseName: "model",
          mayaFile: ensured.mayaFile,
          nustFile: ensured.nustFile,
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
          };
        });
      },

      setLastResult: (lastResult) => set({ lastResult }),

      loadTemplateLibrary: async () => {
        set({ templatesLoading: true, templateLibraryError: null });
        try {
          const templateLibrary = await loadNumatbTemplateLibrary();
          set({ templateLibrary, templatesLoading: false });
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
        });
      },

      deleteTemplateById: async (templateId) => {
        const templateLibrary = await deleteNumatbTemplate(templateId);
        set((state) => ({
          templateLibrary,
          selectedTemplateId: state.selectedTemplateId === templateId ? null : state.selectedTemplateId,
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
        });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: SESSION_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionVersion: state.sessionVersion,
        importKind: state.importKind,
        sourcePath: state.sourcePath,
        analysis: state.analysis,
        includeGeometryNames: state.includeGeometryNames,
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
        numdlbEntries: state.numdlbEntries,
        selectedTemplateId: state.selectedTemplateId,
        mayaFile: state.mayaFile,
        nustFile: state.nustFile,
        lastResult: state.lastResult,
      }),
      migrate: (persistedState) => {
        const next = persistedState as Partial<DaeSsbhSessionState> & Record<string, unknown> | undefined;
        return {
          ...buildInitialState(),
          ...next,
          sessionVersion: SESSION_VERSION,
          mirrorTexturePathsAcrossProfiles: next?.mirrorTexturePathsAcrossProfiles ?? true,
          mayaFile: normalizeMatlDataJson(next?.mayaFile ?? createEmptyNumatbFile()),
          nustFile: normalizeMatlDataJson(next?.nustFile ?? createEmptyNumatbFile()),
        };
      },
    },
  ),
);
