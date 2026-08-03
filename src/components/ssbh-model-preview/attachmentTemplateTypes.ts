/**
 * Global attachment template domain (NUMATB-like library).
 * Templates bind stable modelIds + bone names; runtime resolves to preview instance ids.
 */

export type ModelId = string;

export type ModelRef =
  | { kind: "numdlbPath"; path: string }
  | { kind: "unitModelLabel"; label: string }
  | { kind: "previewSlot"; slot: number };

export type ModelBindingRole = "body" | "weapon" | "effect" | "other";

export type ModelBinding = {
  modelId: ModelId;
  ref: ModelRef;
  role?: ModelBindingRole;
  displayName?: string;
};

export type AttachmentEdge = {
  id: string;
  hostModelId: ModelId;
  hostBoneName: string;
  guestModelId: ModelId;
  guestBoneName: string;
  enabled: boolean;
};

export type AttachmentTemplate = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  unitHint?: string | null;
  bindings: ModelBinding[];
  edges: AttachmentEdge[];
  primaryModelId?: ModelId | null;
};

export type AttachmentTemplateLibrary = {
  version: number;
  templates: AttachmentTemplate[];
};

export type ResolvedPreviewAttachment = {
  id: string;
  parentInstanceId: string;
  parentBoneName: string;
  childInstanceId: string;
  childBoneName: string;
};

export type MotionBundleClip = {
  modelId: ModelId;
  nuanmbPath: string;
  name?: string;
};

export type MotionPlayPlan =
  | {
      kind: "single";
      actionId: ModelId;
      nuanmbPath: string;
      name?: string;
    }
  | {
      kind: "bundle";
      actionId: ModelId;
      clips: MotionBundleClip[];
    };

export const ATTACHMENT_TEMPLATE_LIBRARY_VERSION = 1;
export const ZERO_MODEL_ID = "00000000";
