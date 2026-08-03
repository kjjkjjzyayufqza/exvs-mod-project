import {
  type AttachmentEdge,
  type AttachmentTemplate,
  type ModelBinding,
  type ModelId,
  type ModelRef,
  type MotionBundleClip,
  type MotionPlayPlan,
  type ResolvedPreviewAttachment,
  ZERO_MODEL_ID,
} from "./attachmentTemplateTypes";

const HEX8 = /^[0-9a-fA-F]{8}$/;

export function normalizeModelId(raw: string, fieldName = "modelId"): ModelId {
  const trimmed = raw.trim().replace(/^0x/i, "");
  if (!HEX8.test(trimmed)) {
    throw new Error(`${fieldName} must be an 8-digit hex value`);
  }
  return trimmed.toLowerCase();
}

export function isZeroModelId(id: string): boolean {
  return normalizeModelId(id, "id") === ZERO_MODEL_ID;
}

export function createAttachmentEdgeId(): string {
  return `edge_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function createAttachmentTemplateId(): string {
  return `attach_tmpl_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function preferBoneIndex(boneNames: readonly string[] | null | undefined, preferredName?: string | null): number {
  if (!boneNames?.length) return 0;
  if (preferredName) {
    const exact = boneNames.indexOf(preferredName);
    if (exact >= 0) return exact;
    const lower = preferredName.toLowerCase();
    const ci = boneNames.findIndex((name) => name.toLowerCase() === lower);
    if (ci >= 0) return ci;
  }
  const gbl = boneNames.findIndex((name) => name.toUpperCase() === "GBL_RT");
  if (gbl >= 0) return gbl;
  return 0;
}

function bindingKey(ref: ModelRef): string {
  if (ref.kind === "numdlbPath") return `path:${ref.path.replace(/\//g, "\\").toLowerCase()}`;
  if (ref.kind === "unitModelLabel") return `label:${ref.label.trim().toLowerCase()}`;
  return `slot:${ref.slot}`;
}

export function validateAttachmentTemplate(template: AttachmentTemplate): string[] {
  const errors: string[] = [];
  if (!template.name.trim()) {
    errors.push("Template name is required");
  }
  const bindingIds = new Map<string, ModelBinding>();
  for (const binding of template.bindings) {
    try {
      const id = normalizeModelId(binding.modelId, "binding.modelId");
      if (bindingIds.has(id)) {
        errors.push(`Duplicate modelId binding: ${id}`);
      } else {
        bindingIds.set(id, binding);
      }
      if (binding.ref.kind === "numdlbPath" && !binding.ref.path.trim()) {
        errors.push(`Binding ${id} has empty numdlb path`);
      }
      if (binding.ref.kind === "unitModelLabel" && !binding.ref.label.trim()) {
        errors.push(`Binding ${id} has empty unit model label`);
      }
      if (binding.ref.kind === "previewSlot" && (!Number.isFinite(binding.ref.slot) || binding.ref.slot < 0)) {
        errors.push(`Binding ${id} has invalid preview slot`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const graph = new Map<string, string[]>();
  for (const edge of template.edges) {
    let hostId: string;
    let guestId: string;
    try {
      hostId = normalizeModelId(edge.hostModelId, "edge.hostModelId");
      guestId = normalizeModelId(edge.guestModelId, "edge.guestModelId");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (hostId === guestId) {
      errors.push(`Attachment edge ${edge.id} has the same host and guest modelId`);
    }
    if (!edge.hostBoneName.trim()) {
      errors.push(`Attachment edge ${edge.id} missing host bone name`);
    }
    if (!edge.guestBoneName.trim()) {
      errors.push(`Attachment edge ${edge.id} missing guest bone name`);
    }
    if (!bindingIds.has(hostId)) {
      errors.push(`Attachment edge ${edge.id} host modelId ${hostId} has no binding`);
    }
    if (!bindingIds.has(guestId)) {
      errors.push(`Attachment edge ${edge.id} guest modelId ${guestId} has no binding`);
    }
    if (!edge.enabled) continue;
    const list = graph.get(hostId) ?? [];
    list.push(guestId);
    graph.set(hostId, list);
  }

  if (template.primaryModelId) {
    try {
      const primary = normalizeModelId(template.primaryModelId, "primaryModelId");
      if (!bindingIds.has(primary)) {
        errors.push(`primaryModelId ${primary} has no binding`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (hasAttachmentCycle(graph)) {
    errors.push("Attachment graph contains a cycle");
  }
  return errors;
}

/** Directed edges host → guest (guest is parented under host). Cycle means invalid constraint order. */
export function hasAttachmentCycle(adjacency: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const node of adjacency.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

export type ResolveAttachmentTemplateInput = {
  template: AttachmentTemplate;
  /** modelId → loaded preview instance id */
  instanceByModelId: ReadonlyMap<string, string>;
  /** Optional bone name validation: instanceId → bone names */
  boneNamesByInstanceId?: ReadonlyMap<string, readonly string[]>;
};

export type ResolveAttachmentTemplateResult = {
  attachments: ResolvedPreviewAttachment[];
  primaryInstanceId: string | null;
  warnings: string[];
  errors: string[];
};

export function resolveAttachmentTemplate(
  input: ResolveAttachmentTemplateInput,
): ResolveAttachmentTemplateResult {
  const structural = validateAttachmentTemplate(input.template);
  if (structural.length > 0) {
    return { attachments: [], primaryInstanceId: null, warnings: [], errors: structural };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const attachments: ResolvedPreviewAttachment[] = [];

  for (const edge of input.template.edges) {
    if (!edge.enabled) continue;
    const hostId = normalizeModelId(edge.hostModelId);
    const guestId = normalizeModelId(edge.guestModelId);
    const parentInstanceId = input.instanceByModelId.get(hostId);
    const childInstanceId = input.instanceByModelId.get(guestId);
    if (!parentInstanceId) {
      errors.push(`Host modelId ${hostId} is not loaded`);
      continue;
    }
    if (!childInstanceId) {
      errors.push(`Guest modelId ${guestId} is not loaded`);
      continue;
    }
    if (parentInstanceId === childInstanceId) {
      errors.push(`Edge ${edge.id} resolves host and guest to the same instance`);
      continue;
    }
    const hostBones = input.boneNamesByInstanceId?.get(parentInstanceId);
    const guestBones = input.boneNamesByInstanceId?.get(childInstanceId);
    if (hostBones && !hostBones.includes(edge.hostBoneName)) {
      errors.push(`Host bone "${edge.hostBoneName}" not found on modelId ${hostId}`);
      continue;
    }
    if (guestBones && !guestBones.includes(edge.guestBoneName)) {
      errors.push(`Guest bone "${edge.guestBoneName}" not found on modelId ${guestId}`);
      continue;
    }
    if (edge.hostBoneName.toUpperCase().startsWith("ATH_") || edge.guestBoneName.toUpperCase().startsWith("ATH_")) {
      warnings.push(`Edge ${edge.id} uses ATH_* helper bone; in-game helpers may fight this attach`);
    }
    attachments.push({
      id: edge.id,
      parentInstanceId,
      parentBoneName: edge.hostBoneName,
      childInstanceId,
      childBoneName: edge.guestBoneName,
    });
  }

  let primaryInstanceId: string | null = null;
  if (input.template.primaryModelId) {
    const primary = normalizeModelId(input.template.primaryModelId);
    primaryInstanceId = input.instanceByModelId.get(primary) ?? null;
    if (!primaryInstanceId) {
      errors.push(`Primary modelId ${primary} is not loaded`);
    }
  }

  return { attachments, primaryInstanceId, warnings, errors };
}

export function buildAttachmentTemplate(params: {
  id?: string;
  name: string;
  description?: string;
  unitHint?: string | null;
  bindings: ModelBinding[];
  edges: AttachmentEdge[];
  primaryModelId?: ModelId | null;
}): AttachmentTemplate {
  const name = params.name.trim();
  if (!name) {
    throw new Error("Template name is required");
  }
  const template: AttachmentTemplate = {
    id: params.id?.trim() || createAttachmentTemplateId(),
    name,
    description: params.description?.trim() ?? "",
    updatedAt: new Date().toISOString(),
    unitHint: params.unitHint ?? null,
    bindings: params.bindings.map((binding) => ({
      ...binding,
      modelId: normalizeModelId(binding.modelId),
    })),
    edges: params.edges.map((edge) => ({
      ...edge,
      hostModelId: normalizeModelId(edge.hostModelId, "hostModelId"),
      guestModelId: normalizeModelId(edge.guestModelId, "guestModelId"),
      hostBoneName: edge.hostBoneName.trim(),
      guestBoneName: edge.guestBoneName.trim(),
      enabled: edge.enabled !== false,
    })),
    primaryModelId: params.primaryModelId
      ? normalizeModelId(params.primaryModelId, "primaryModelId")
      : null,
  };
  const errors = validateAttachmentTemplate(template);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return template;
}

export function invertInstanceModelBindings(
  bindings: readonly ModelBinding[],
  instanceByRef: ReadonlyMap<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const binding of bindings) {
    const id = normalizeModelId(binding.modelId);
    const instanceId = instanceByRef.get(bindingKey(binding.ref));
    if (instanceId) {
      out.set(id, instanceId);
    }
  }
  return out;
}

export function modelRefLookupKey(ref: ModelRef): string {
  return bindingKey(ref);
}

export type MotionStructureLikeNode =
  | {
      kind: "folder";
      unk1: string;
      children: MotionStructureLikeNode[];
    }
  | {
      kind: "item";
      unk1: string;
      unk2: string;
      name: string;
      filePath: string;
    };

/**
 * Build a play plan from a motion structure node.
 * - Single item: actionId = item.unk1, one clip (primary only).
 * - Folder: actionId = folder.unk1, each child item clip uses item.unk2 as modelId.
 */
export function buildMotionPlayPlanFromNode(node: MotionStructureLikeNode): MotionPlayPlan {
  if (node.kind === "item") {
    return {
      kind: "single",
      actionId: normalizeModelId(node.unk1, "item.unk1 (action id)"),
      nuanmbPath: node.filePath,
      name: node.name,
    };
  }

  const actionId = normalizeModelId(node.unk1, "folder.unk1 (action id)");
  const clips: MotionBundleClip[] = [];
  for (const child of node.children) {
    if (child.kind !== "item") {
      throw new Error("Motion folder bundle only supports item children (nested folders unsupported)");
    }
    const modelId = normalizeModelId(child.unk2, `item ${child.name} unk2 (model id)`);
    if (modelId === ZERO_MODEL_ID) {
      throw new Error(`Motion item "${child.name}" has model id 00000000; bind a real model id`);
    }
    clips.push({
      modelId,
      nuanmbPath: child.filePath,
      name: child.name,
    });
  }
  if (clips.length === 0) {
    throw new Error("Motion folder has no playable .nuanmb items");
  }
  return { kind: "bundle", actionId, clips };
}

export function collectRequiredModelIds(plan: MotionPlayPlan): ModelId[] {
  if (plan.kind === "single") return [];
  return [...new Set(plan.clips.map((clip) => clip.modelId))];
}

/**
 * Column-major 4×4 (Three.js / WebGL layout). Identity when omitted elements missing.
 * Used by viewport attachment: guestRoot = hostBoneWorld × inv(guestBoneWorld).
 */
export type Mat4ColumnMajor = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
] | readonly number[];

function mat4Identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row]! * b[col * 4 + 0]! +
        a[1 * 4 + row]! * b[col * 4 + 1]! +
        a[2 * 4 + row]! * b[col * 4 + 2]! +
        a[3 * 4 + row]! * b[col * 4 + 3]!;
    }
  }
  return out;
}

/** Invert a column-major affine/general 4×4; throws if singular. */
export function mat4Invert(m: readonly number[]): number[] {
  if (m.length !== 16) {
    throw new Error("mat4Invert expects 16 elements");
  }
  // Based on the common MESA / gl-matrix general inverse (column-major).
  const inv = new Array<number>(16);
  inv[0] =
    m[5]! * m[10]! * m[15]! -
    m[5]! * m[11]! * m[14]! -
    m[9]! * m[6]! * m[15]! +
    m[9]! * m[7]! * m[14]! +
    m[13]! * m[6]! * m[11]! -
    m[13]! * m[7]! * m[10]!;
  inv[4] =
    -m[4]! * m[10]! * m[15]! +
    m[4]! * m[11]! * m[14]! +
    m[8]! * m[6]! * m[15]! -
    m[8]! * m[7]! * m[14]! -
    m[12]! * m[6]! * m[11]! +
    m[12]! * m[7]! * m[10]!;
  inv[8] =
    m[4]! * m[9]! * m[15]! -
    m[4]! * m[11]! * m[13]! -
    m[8]! * m[5]! * m[15]! +
    m[8]! * m[7]! * m[13]! +
    m[12]! * m[5]! * m[11]! -
    m[12]! * m[7]! * m[9]!;
  inv[12] =
    -m[4]! * m[9]! * m[14]! +
    m[4]! * m[10]! * m[13]! +
    m[8]! * m[5]! * m[14]! -
    m[8]! * m[6]! * m[13]! -
    m[12]! * m[5]! * m[10]! +
    m[12]! * m[6]! * m[9]!;
  inv[1] =
    -m[1]! * m[10]! * m[15]! +
    m[1]! * m[11]! * m[14]! +
    m[9]! * m[2]! * m[15]! -
    m[9]! * m[3]! * m[14]! -
    m[13]! * m[2]! * m[11]! +
    m[13]! * m[3]! * m[10]!;
  inv[5] =
    m[0]! * m[10]! * m[15]! -
    m[0]! * m[11]! * m[14]! -
    m[8]! * m[2]! * m[15]! +
    m[8]! * m[3]! * m[14]! +
    m[12]! * m[2]! * m[11]! -
    m[12]! * m[3]! * m[10]!;
  inv[9] =
    -m[0]! * m[9]! * m[15]! +
    m[0]! * m[11]! * m[13]! +
    m[8]! * m[1]! * m[15]! -
    m[8]! * m[3]! * m[13]! -
    m[12]! * m[1]! * m[11]! +
    m[12]! * m[3]! * m[9]!;
  inv[13] =
    m[0]! * m[9]! * m[14]! -
    m[0]! * m[10]! * m[13]! -
    m[8]! * m[1]! * m[14]! +
    m[8]! * m[2]! * m[13]! +
    m[12]! * m[1]! * m[10]! -
    m[12]! * m[2]! * m[9]!;
  inv[2] =
    m[1]! * m[6]! * m[15]! -
    m[1]! * m[7]! * m[14]! -
    m[5]! * m[2]! * m[15]! +
    m[5]! * m[3]! * m[14]! +
    m[13]! * m[2]! * m[7]! -
    m[13]! * m[3]! * m[6]!;
  inv[6] =
    -m[0]! * m[6]! * m[15]! +
    m[0]! * m[7]! * m[14]! +
    m[4]! * m[2]! * m[15]! -
    m[4]! * m[3]! * m[14]! -
    m[12]! * m[2]! * m[7]! +
    m[12]! * m[3]! * m[6]!;
  inv[10] =
    m[0]! * m[5]! * m[15]! -
    m[0]! * m[7]! * m[13]! -
    m[4]! * m[1]! * m[15]! +
    m[4]! * m[3]! * m[13]! +
    m[12]! * m[1]! * m[7]! -
    m[12]! * m[3]! * m[5]!;
  inv[14] =
    -m[0]! * m[5]! * m[14]! +
    m[0]! * m[6]! * m[13]! +
    m[4]! * m[1]! * m[14]! -
    m[4]! * m[2]! * m[13]! -
    m[12]! * m[1]! * m[6]! +
    m[12]! * m[2]! * m[5]!;
  inv[3] =
    -m[1]! * m[6]! * m[11]! +
    m[1]! * m[7]! * m[10]! +
    m[5]! * m[2]! * m[11]! -
    m[5]! * m[3]! * m[10]! -
    m[9]! * m[2]! * m[7]! +
    m[9]! * m[3]! * m[6]!;
  inv[7] =
    m[0]! * m[6]! * m[11]! -
    m[0]! * m[7]! * m[10]! -
    m[4]! * m[2]! * m[11]! +
    m[4]! * m[3]! * m[10]! +
    m[8]! * m[2]! * m[7]! -
    m[8]! * m[3]! * m[6]!;
  inv[11] =
    -m[0]! * m[5]! * m[11]! +
    m[0]! * m[7]! * m[9]! +
    m[4]! * m[1]! * m[11]! -
    m[4]! * m[3]! * m[9]! -
    m[8]! * m[1]! * m[7]! +
    m[8]! * m[3]! * m[5]!;
  inv[15] =
    m[0]! * m[5]! * m[10]! -
    m[0]! * m[6]! * m[9]! -
    m[4]! * m[1]! * m[10]! +
    m[4]! * m[2]! * m[9]! +
    m[8]! * m[1]! * m[6]! -
    m[8]! * m[2]! * m[5]!;

  let det = m[0]! * inv[0]! + m[1]! * inv[4]! + m[2]! * inv[8]! + m[3]! * inv[12]!;
  if (Math.abs(det) < 1e-12) {
    throw new Error("mat4Invert: singular matrix");
  }
  det = 1 / det;
  for (let i = 0; i < 16; i += 1) {
    inv[i] = inv[i]! * det;
  }
  return inv;
}

/**
 * Shipped viewport attachment composition (same as SsbhModelCanvas useFrame):
 * guestRootWorld = hostBoneWorld × inv(guestAttachBoneRelativeToGuestRoot).
 *
 * The second matrix must be the guest attach bone in **guest root local space**,
 * not full world space that already includes a previous attach offset. Using full
 * world (group × local) causes a feedback loop and flings the guest when the host
 * animates (e.g. beam rifle on TE_R).
 */
export function composeGuestAttachRootMatrix(
  hostBoneWorld: Mat4ColumnMajor,
  guestAttachBoneRelativeToRoot: Mat4ColumnMajor,
): number[] {
  if (hostBoneWorld.length !== 16 || guestAttachBoneRelativeToRoot.length !== 16) {
    throw new Error("composeGuestAttachRootMatrix expects 4×4 matrices (16 floats each)");
  }
  const guestInv = mat4Invert(guestAttachBoneRelativeToRoot);
  return mat4Multiply(hostBoneWorld, guestInv);
}

/**
 * guestBoneWorld includes guestRootWorld (bones parented under instance group).
 * Returns attach-bone matrix relative to the guest root for composeGuestAttachRootMatrix.
 */
export function guestAttachBoneRelativeToRoot(
  guestRootWorld: Mat4ColumnMajor,
  guestBoneWorld: Mat4ColumnMajor,
): number[] {
  if (guestRootWorld.length !== 16 || guestBoneWorld.length !== 16) {
    throw new Error("guestAttachBoneRelativeToRoot expects 4×4 matrices (16 floats each)");
  }
  return mat4Multiply(mat4Invert(guestRootWorld), guestBoneWorld);
}

/**
 * Build attach-bone matrix from local bone.matrix chain only (root bone → attach bone).
 * Ignores any parent Group attach offset — required so attach is feedback-free and works
 * with SkinnedMesh bindMode "detached" (skin uses bone.matrixWorld, not mesh parent).
 *
 * `getParent` should return the bone parent or null when hitting a non-bone (e.g. Group).
 * `getLocalMatrix` returns that bone's local 4×4 (column-major).
 */
export function composeBoneLocalChainMatrix(
  attachBoneId: string,
  getParent: (id: string) => string | null,
  getLocalMatrix: (id: string) => Mat4ColumnMajor,
): number[] {
  const chain: string[] = [];
  let cur: string | null = attachBoneId;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) {
      throw new Error(`composeBoneLocalChainMatrix: cycle at ${cur}`);
    }
    guard.add(cur);
    chain.push(cur);
    cur = getParent(cur);
  }
  let acc = mat4Identity();
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    acc = mat4Multiply(acc, getLocalMatrix(chain[i]!));
  }
  return acc;
}

/** Translation column of a column-major 4×4 (elements 12,13,14). */
export function mat4Translation(m: readonly number[]): [number, number, number] {
  return [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
}

export function mat4FromTranslation(x: number, y: number, z: number): number[] {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

