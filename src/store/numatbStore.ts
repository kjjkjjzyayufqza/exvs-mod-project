import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { exists } from "@tauri-apps/plugin-fs";
import { ssbhTemplateReadNumatb, ssbhTemplateWriteNumatb } from "@/components/ssbh-model-preview/ssbhDaeIoService";
import { ensureMatlDataSerdeFields } from "@/components/ssbh-model-preview/daeSsbhTypes";
import { flattenEntryToAttributes } from "@/components/ssbh-model-preview/store/matlEntryFlat";
import { convertLegacyNumatbFileToMatlData } from "@/components/ssbh-model-preview/store/numatbProfileMigration";
import type { MatlDataJson } from "@/components/ssbh-model-preview/types";

export interface FileInfo {
  name: string;
  path: string;
}

// Param ID type definitions based on common patterns
export type ParamDataType = 'Boolean' | 'Float' | 'Float1' | 'String' | 'String1' | 'Vector4' | 'Sampler' | 'Unk7';

// Comprehensive param_id type mapping
export const PARAM_TYPE_MAPPING: Record<string, ParamDataType> = {
  // Boolean types
  'ReceiveShadow': 'Boolean',
  'UseAmbientOcclusionMap': 'Boolean',
  'UseMetallicMap': 'Boolean',
  'UseRoughnessMap': 'Boolean',
  'UseNormalMap': 'Boolean',
  'UseEmissiveMap': 'Boolean',
  'NormalMapBc5': 'Boolean',
  
  // Float1 types
  'CustomFloat0': 'Float1',
  'CustomFloat1': 'Float1',
  'CustomFloat2': 'Float1',
  'CustomFloat3': 'Float1',
  'CustomFloat4': 'Float1',
  'CustomFloat5': 'Float1',
  'CustomFloat7': 'Float1',
  'CustomFloat8': 'Float1',
  'CustomFloat9': 'Float1',
  'EmissiveScale': 'Float1',
  'CosinePower': 'Float1',
  
  // Float types
  'CustomInteger0': 'Float',
  
  // String1 types (textures and paths) - numatb conversion uses String1
  'BaseColorMap': 'String1',
  'EmissiveMap': 'String1',
  'NormalMap': 'String1',
  'AmbientOcclusionMap': 'String1',
  'RoughnessMap': 'String1',
  'MetallicMap': 'String1',
  'DiffuseCubeMap': 'String1',
  'Texture1': 'String1',
  
  // Vector4 types
  'CustomVector0': 'Vector4',
  'CustomVector2': 'Vector4',
  'CustomVector3': 'Vector4',
  
  // Color/Unk7 types
  'CustomColor0': 'Unk7',
  'CustomColor1': 'Unk7',
  'CustomColor2': 'Unk7',
  'Diffuse': 'Unk7',
  'Specular': 'Unk7',
  
  // Sampler types
  'DiffuseSampler': 'Sampler',
};

// Get param type with fallback detection
export const getParamType = (paramId: string, currentData: AttributeData): ParamDataType => {
  // First check our mapping
  if (PARAM_TYPE_MAPPING[paramId]) {
    return PARAM_TYPE_MAPPING[paramId];
  }
  
  // Fallback to detecting from current data
  if (currentData.Boolean !== undefined) return 'Boolean';
  if (currentData.Float !== undefined) return 'Float';
  if (currentData.Float1 !== undefined) return 'Float1';
  if (currentData.String !== undefined) return 'String';
  if (currentData.String1 !== undefined) return 'String1';
  if (currentData.Vector4 !== undefined) return 'Vector4';
  if (currentData.Sampler !== undefined) return 'Sampler';
  if (currentData.Unk7 !== undefined) return 'Unk7';
  
  // Default fallback
  return 'Float1';
};

// Get default value for a param type
export const getDefaultValueForType = (dataType: ParamDataType): AttributeData => {
  switch (dataType) {
    case 'Boolean':
      return { Boolean: 0 };
    case 'Float':
      return { Float: 0.0 };
    case 'Float1':
      return { Float1: 0.0 };
    case 'String':
      return { String: "" };
    case 'String1':
      return { String1: "" };
    case 'Vector4':
      return { Vector4: { x: 0.0, y: 0.0, z: 0.0, w: 0.0 } };
    case 'Unk7':
      return { Unk7: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 } };
    case 'Sampler':
      return {
        Sampler: {
          wraps: "Repeat",
          wrapt: "Repeat",
          wrapr: "Repeat",
          min_filter: "LinearMipmapLinear",
          mag_filter: "Linear",
          texture_filtering_type: "Default2",
          border_color: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          unk11: 0,
          unk12: 1098907648,
          lod_bias: -1.0,
          max_anisotropy: "One"
        }
      };
    default:
      return { Float1: 0.0 };
  }
};

// Parameter-specific default values based on JSON data
export const PARAM_SPECIFIC_DEFAULTS: Record<string, AttributeData> = {
  'Diffuse': {
    Unk7: {
      r: 1.0,
      g: 1.0,
      b: 1.0,
      a: 1.0
    }
  },
  'Specular': {
    Unk7: {
      r: 1.0,
      g: 1.0,
      b: 1.0,
      a: 1.0
    }
  },
  'CosinePower': {
    Float1: 20.0
  }
};

// Get default value for a specific parameter
export const getDefaultValueForParam = (paramId: string): AttributeData => {
  // Check if we have a specific default for this parameter
  if (PARAM_SPECIFIC_DEFAULTS[paramId]) {
    return PARAM_SPECIFIC_DEFAULTS[paramId];
  }
  
  // Fall back to type-based default
  const dataType = getParamType(paramId, {} as AttributeData);
  return getDefaultValueForType(dataType);
};

// Common attribute templates
export const COMMON_ATTRIBUTES = [
  'ReceiveShadow',
  'UseAmbientOcclusionMap',
  'UseMetallicMap',
  'UseRoughnessMap',
  'UseNormalMap',
  'UseEmissiveMap',
  'NormalMapBc5',
  'CustomFloat0',
  'CustomFloat1',
  'CustomFloat2',
  'CustomFloat3',
  'CustomFloat4',
  'CustomFloat5',
  'CustomFloat7',
  'CustomFloat8',
  'CustomFloat9',
  'EmissiveScale',
  'CosinePower',
  'CustomInteger0',
  'BaseColorMap',
  'EmissiveMap',
  'NormalMap',
  'AmbientOcclusionMap',
  'RoughnessMap',
  'MetallicMap',
  'DiffuseCubeMap',
  'Texture1',
  'CustomVector0',
  'CustomVector2',
  'CustomVector3',
  'CustomColor0',
  'CustomColor1',
  'CustomColor2',
  'Diffuse',
  'Specular',
  'DiffuseSampler',
];

// Updated type definitions to match the new JSON structure
interface AttributeData {
  Boolean?: number;
  Float?: number;
  Float1?: number;
  String?: string;
  String1?: string;
  Vector4?: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  Sampler?: {
    wraps: string;
    wrapt: string;
    wrapr: string;
    min_filter: string;
    mag_filter: string;
    texture_filtering_type: string;
    border_color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
    unk11: number;
    unk12: number;
    lod_bias: number;
    max_anisotropy: string;
  };
  Unk7?: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
}

interface MaterialAttribute {
  param_id: string;
  param: {
    data: AttributeData;
  };
}

interface MaterialEntry {
  material_label: string;
  attributes: MaterialAttribute[];
  shader_label: string;
}

export interface NumatbData {
  Matl: {
    V16: {
      entries: MaterialEntry[];
    };
  };
}

function matlDataToLegacyNumatb(matl: MatlDataJson): NumatbData {
  return {
    Matl: {
      V16: {
        entries: matl.entries.map((entry) => ({
          material_label: entry.material_label,
          shader_label: entry.shader_label,
          attributes: flattenEntryToAttributes(entry) as MaterialAttribute[],
        })),
      },
    },
  };
}

interface NumatbStore {
  selectedFile: FileInfo | null;
  numatbData: NumatbData | null;
  isConverting: boolean;
  isSaving: boolean;
  error: string | null;
  setSelectedFile: (file: FileInfo | null) => void;
  resetConversion: () => void;
  convertFile: (file: FileInfo) => Promise<void>;
  updateAttribute: (materialIndex: number, attributeIndex: number, newValue: any, dataType: ParamDataType) => void;
  updateMaterialLabel: (materialIndex: number, newLabel: string) => void;
  addAttribute: (materialIndex: number, paramId: string) => void;
  removeAttribute: (materialIndex: number, attributeIndex: number) => void;
  addMaterialEntry: () => void;
  copyMaterialAsNew: (materialIndex: number) => void;
  removeMaterialEntry: (materialIndex: number) => void;
  saveFile: () => Promise<void>;
}

export const useNumatbStore = create<NumatbStore>()(
  immer((set, get) => ({
  selectedFile: null,
  numatbData: null,
  isConverting: false,
  isSaving: false,
  error: null,
  
  setSelectedFile: (file) => set({ selectedFile: file }),
  
  resetConversion: () => set({
    selectedFile: null,
    isConverting: false,
    isSaving: false,
    error: null,
    numatbData: null
  }),

  updateAttribute: (materialIndex: number, attributeIndex: number, newValue: any, dataType: ParamDataType) => {
    set((state) => {
      if (!state.numatbData?.Matl?.V16?.entries?.[materialIndex]?.attributes?.[attributeIndex]) return;

      const attribute = state.numatbData.Matl.V16.entries[materialIndex].attributes[attributeIndex];
      
      // Clear all data types first
      attribute.param.data = {};
      
      // Set the appropriate data type
      switch (dataType) {
        case 'Boolean':
          attribute.param.data.Boolean = parseInt(newValue) || 0;
          break;
        case 'Float':
          attribute.param.data.Float = parseFloat(newValue) || 0;
          break;
        case 'Float1':
          attribute.param.data.Float1 = parseFloat(newValue) || 0;
          break;
        case 'String':
          attribute.param.data.String = newValue || "";
          break;
        case 'String1':
          attribute.param.data.String1 = newValue || "";
          break;
        case 'Vector4':
          if (typeof newValue === 'object' && newValue !== null) {
            attribute.param.data.Vector4 = {
              x: parseFloat(newValue.x) || 0,
              y: parseFloat(newValue.y) || 0,
              z: parseFloat(newValue.z) || 0,
              w: parseFloat(newValue.w) || 0,
            };
          }
          break;
        case 'Unk7':
          if (typeof newValue === 'object' && newValue !== null) {
            attribute.param.data.Unk7 = {
              r: parseFloat(newValue.r) || 0,
              g: parseFloat(newValue.g) || 0,
              b: parseFloat(newValue.b) || 0,
              a: parseFloat(newValue.a) || 0,
            };
          }
          break;
        case 'Sampler':
          // Sampler is complex, keep original for now
          if (typeof newValue === 'object' && newValue !== null) {
            attribute.param.data.Sampler = newValue;
          }
          break;
      }
    });
  },

  addAttribute: (materialIndex: number, paramId: string) => {
    set((state) => {
      if (!state.numatbData?.Matl?.V16?.entries?.[materialIndex]) return;

      const material = state.numatbData.Matl.V16.entries[materialIndex];
      
      // Check if attribute already exists
      const existingIndex = material.attributes.findIndex((attr: MaterialAttribute) => attr.param_id === paramId);
      if (existingIndex !== -1) {
        console.warn(`Attribute ${paramId} already exists`);
        return;
      }

      // Get the parameter-specific default value
      const defaultData = getDefaultValueForParam(paramId);

      // Create new attribute
      const newAttribute: MaterialAttribute = {
        param_id: paramId,
        param: {
          data: defaultData
        }
      };

      // Add to attributes array
      material.attributes.push(newAttribute);
    });
  },

  updateMaterialLabel: (materialIndex: number, newLabel: string) => {
    set((state) => {
      if (!state.numatbData?.Matl?.V16?.entries?.[materialIndex]) return;
      state.numatbData.Matl.V16.entries[materialIndex].material_label = newLabel;
    });
  },

  removeAttribute: (materialIndex: number, attributeIndex: number) => {
    set((state) => {
      if (!state.numatbData?.Matl?.V16?.entries?.[materialIndex]?.attributes?.[attributeIndex]) return;
      
      const material = state.numatbData.Matl.V16.entries[materialIndex];
      // Remove the attribute
      material.attributes.splice(attributeIndex, 1);
    });
  },

  copyMaterialAsNew: (materialIndex: number) => {
    set((state) => {
      if (!state.numatbData?.Matl?.V16) return;
      const materials = state.numatbData.Matl.V16.entries;
      if (!materials || materialIndex < 0 || materialIndex >= materials.length) return;

      const sourceMaterial = materials[materialIndex];

      // Deep clone the material with a new label
      const copiedMaterial: MaterialEntry = {
        material_label: `${sourceMaterial.material_label}_copy`,
        shader_label: sourceMaterial.shader_label,
        attributes: sourceMaterial.attributes.map(attr => ({
          param_id: attr.param_id,
          param: {
            data: JSON.parse(JSON.stringify(attr.param.data)) // Deep clone
          }
        }))
      };

      // Add the copied material to the end
      state.numatbData!.Matl!.V16.entries.push(copiedMaterial);
    });
  },

  removeMaterialEntry: (materialIndex: number) => {
    set((state) => {
      if (!state.numatbData?.Matl?.V16) return;
      const materials = state.numatbData.Matl.V16.entries;
      if (!materials || materialIndex < 0 || materialIndex >= materials.length) return;

      // Remove the material at the specified index
      materials.splice(materialIndex, 1);
    });
  },

  addMaterialEntry: () => {
    set((state) => {
      if (!state.numatbData?.Matl?.V16) return;
      // Create a new material entry based on the template from model.json
      const newEntry: MaterialEntry = {
        material_label: "prb_new",
        attributes: [
          {
            param_id: "UseSpecularMap",
            param: { data: { Boolean: 0 } }
          },
          {
            param_id: "UseEmissiveMap",
            param: { data: { Boolean: 1 } }
          },
          {
            param_id: "CustomInteger0",
            param: { data: { Float: 0.0 } }
          },
          {
            param_id: "UseNormalMap",
            param: { data: { Boolean: 1 } }
          },
          {
            param_id: "CustomFloat7",
            param: { data: { Float1: 1.0 } }
          },
          {
            param_id: "CustomVector0",
            param: { data: { Vector4: { x: 0.0, y: 0.0, z: 0.0, w: 0.0 } } }
          },
          {
            param_id: "CustomFloat8",
            param: { data: { Float1: 1.0 } }
          },
          {
            param_id: "ReceiveShadow",
            param: { data: { Boolean: 1 } }
          },
          {
            param_id: "CustomVector3",
            param: { data: { Vector4: { x: 1.0, y: 1.0, z: 1.0, w: 1.0 } } }
          },
          {
            param_id: "CustomVector2",
            param: { data: { Vector4: { x: 1.0, y: 1.0, z: 1.0, w: 1.0 } } }
          },
          {
            param_id: "Texture1",
            param: { data: { String1: "../../textures/" } }
          },
          {
            param_id: "CustomFloat1",
            param: { data: { Float1: 1.0 } }
          },
          {
            param_id: "NormalMap",
            param: { data: { String1: "../../textures/" } }
          },
          {
            param_id: "CustomFloat3",
            param: { data: { Float1: 1.0 } }
          },
          {
            param_id: "CustomColor0",
            param: { data: { Unk7: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 } } }
          },
          {
            param_id: "CustomColor1",
            param: { data: { Unk7: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 } } }
          },
          {
            param_id: "CustomColor2",
            param: { data: { Unk7: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 } } }
          },
          {
            param_id: "DiffuseSampler",
            param: {
              data: {
                Sampler: {
                  wraps: "Repeat",
                  wrapt: "Repeat",
                  wrapr: "Repeat",
                  min_filter: "LinearMipmapLinear",
                  mag_filter: "Linear",
                  texture_filtering_type: "Default2",
                  border_color: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                  unk11: 0,
                  unk12: 1098907648,
                  lod_bias: -1.0,
                  max_anisotropy: "One"
                }
              }
            }
          },
          {
            param_id: "UseRoughnessMap",
            param: { data: { Boolean: 1 } }
          },
          {
            param_id: "CustomFloat0",
            param: { data: { Float1: 0.1 } }
          },
          {
            param_id: "RoughnessMap",
            param: { data: { String1: "../../textures/" } }
          },
          {
            param_id: "CustomFloat2",
            param: { data: { Float1: 1.0 } }
          },
          {
            param_id: "UseAmbientOcclusionMap",
            param: { data: { Boolean: 1 } }
          },
          {
            param_id: "CustomFloat4",
            param: { data: { Float1: 1.0 } }
          },
          {
            param_id: "AmbientOcclusionMap",
            param: { data: { String1: "../../textures/" } }
          },
          {
            param_id: "NormalMapBc5",
            param: { data: { Boolean: 0 } }
          },
          {
            param_id: "CustomFloat9",
            param: { data: { Float1: 1.0 } }
          },
          {
            param_id: "CustomFloat5",
            param: { data: { Float1: 0.0 } }
          },
          {
            param_id: "EmissiveMap",
            param: { data: { String1: "../../textures/" } }
          },
          {
            param_id: "UseMetallicMap",
            param: { data: { Boolean: 1 } }
          },
          {
            param_id: "EmissiveScale",
            param: { data: { Float1: 0.0 } }
          },
          {
            param_id: "BaseColorMap",
            param: { data: { String1: "../../textures/" } }
          },
          {
            param_id: "MetallicMap",
            param: { data: { String1: "../../textures/" } }
          },
          {
            param_id: "DiffuseCubeMap",
            param: { data: { String1: "../../../share/textures/barispecular00_cubemap" } }
          }
        ],
        shader_label: "vsngCharaBasic"
      };

      state.numatbData.Matl.V16.entries.push(newEntry);
    });
  },

  saveFile: async () => {
    const state = get();
    if (!state.selectedFile || !state.numatbData) return;

    set({ isSaving: true, error: null });

    try {
      const matl = ensureMatlDataSerdeFields(convertLegacyNumatbFileToMatlData(state.numatbData));
      await ssbhTemplateWriteNumatb(state.selectedFile.path, matl);
    } catch (error) {
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      console.error("Error saving file:", error);
      set({ error: errorMessage });
    } finally {
      set({ isSaving: false });
    }
  },

  convertFile: async (file) => {
    if (!file.name.endsWith('.numatb')) return;

    set({
      selectedFile: file,
      isConverting: true,
      numatbData: null,
      error: null
    });

    try {
      const inputFileExists = await exists(file.path);
      if (!inputFileExists) {
        throw new Error(`Input file not found: ${file.path}`);
      }

      const matl = await ssbhTemplateReadNumatb(file.path);
      set({ numatbData: matlDataToLegacyNumatb(matl) });
    } catch (error) {
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        errorMessage = error.message.includes("not found")
          ? "Required file not found"
          : error.message;
      }
      console.error("Error in execution:", error);
      set({ error: errorMessage });
    } finally {
      set({ isConverting: false });
    }
  }
  }))
);
