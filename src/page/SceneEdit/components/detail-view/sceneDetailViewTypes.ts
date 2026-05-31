import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import type { NumdlbReadResult } from "@/components/ssbh-model-preview/ssbhDaeIoService";
import type { NuhlpbReadResult } from "@/components/ssbh-model-preview/ssbhDaeIoService";
import type { NumatbModalBundle } from "@/components/ssbh-model-preview/numatbEditorUtils";
import type { EffectProjectEditorDocument } from "@/components/ssbh-model-preview/effectProjectEditorUtils";
import type { EffectProjectAuxiliarySnapshot } from "@/components/ssbh-model-preview/effectProjectAuxiliaryCache";

export type DetailViewModelTab =
  | "model"
  | "material"
  | "skeleton"
  | "mesh"
  | "helper"
  | "textures";

export type DetailViewEffectTab = "effect";

export type DetailViewTab = DetailViewModelTab | DetailViewEffectTab;

export type DetailViewNodeKind = "ssbh-model" | "effect";

export interface NumatbPathsByProfile {
  maya: string | null;
  nust: string | null;
}

export interface DetailViewModelData {
  bundle: SsbhModelPreviewBundle;
  numdlb: { base: NumdlbReadResult | null; draft: NumdlbReadResult | null; loading: boolean; error: string | null };
  numatb: { base: NumatbModalBundle | null; draft: NumatbModalBundle | null; loading: boolean; error: string | null };
  numatbPaths: NumatbPathsByProfile;
  nuhlpb: { base: NuhlpbReadResult | null; draft: NuhlpbReadResult | null; loading: boolean; error: string | null };
}

export interface DetailViewEffectData {
  document: EffectProjectEditorDocument | null;
  auxiliary: EffectProjectAuxiliarySnapshot;
  loading: boolean;
  error: string | null;
}

export interface DetailViewSession {
  id: string;
  nodeId: string;
  nodeLabel: string;
  kind: DetailViewNodeKind;
  activeTab: DetailViewTab;
  zIndex: number;
  modelData: DetailViewModelData | null;
  effectData: DetailViewEffectData | null;
}

export const SSBH_MODEL_ROLES = ["base", "sub_model", "imported_dae"] as const;
export const EFFECT_ROLES = ["effect"] as const;
export const DETAIL_VIEW_ROLES = [...SSBH_MODEL_ROLES, ...EFFECT_ROLES] as const;

export function canOpenDetailView(role: string): boolean {
  return (DETAIL_VIEW_ROLES as readonly string[]).includes(role);
}
