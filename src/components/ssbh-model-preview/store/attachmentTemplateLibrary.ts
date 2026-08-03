import { load } from "@tauri-apps/plugin-store";
import {
  ATTACHMENT_TEMPLATE_LIBRARY_VERSION,
  type AttachmentTemplate,
  type AttachmentTemplateLibrary,
  type ModelBinding,
  type ModelRef,
  type AttachmentEdge,
} from "../attachmentTemplateTypes";
import { buildAttachmentTemplate, normalizeModelId } from "../attachmentTemplateService";

const CONFIG_STORE_NAME = "settings.json";
const TEMPLATE_LIBRARY_KEY = "ssbhAttachmentTemplateLibrary";

function createDefaultLibrary(): AttachmentTemplateLibrary {
  return {
    version: ATTACHMENT_TEMPLATE_LIBRARY_VERSION,
    templates: [],
  };
}

function normalizeModelRef(raw: unknown): ModelRef | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (kind === "numdlbPath" && typeof obj.path === "string" && obj.path.trim()) {
    return { kind: "numdlbPath", path: obj.path.trim() };
  }
  if (kind === "unitModelLabel" && typeof obj.label === "string" && obj.label.trim()) {
    return { kind: "unitModelLabel", label: obj.label.trim() };
  }
  if (kind === "previewSlot" && typeof obj.slot === "number" && Number.isFinite(obj.slot) && obj.slot >= 0) {
    return { kind: "previewSlot", slot: Math.floor(obj.slot) };
  }
  return null;
}

function normalizeBinding(raw: unknown, index: number): ModelBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const modelIdRaw = typeof obj.modelId === "string" ? obj.modelId : "";
  const ref = normalizeModelRef(obj.ref);
  if (!modelIdRaw || !ref) return null;
  try {
    const modelId = normalizeModelId(modelIdRaw);
    const role =
      obj.role === "body" || obj.role === "weapon" || obj.role === "effect" || obj.role === "other"
        ? obj.role
        : undefined;
    return {
      modelId,
      ref,
      role,
      displayName: typeof obj.displayName === "string" ? obj.displayName : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeEdge(raw: unknown, index: number): AttachmentEdge | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  try {
    const hostModelId = normalizeModelId(String(obj.hostModelId ?? ""), "hostModelId");
    const guestModelId = normalizeModelId(String(obj.guestModelId ?? ""), "guestModelId");
    const hostBoneName = typeof obj.hostBoneName === "string" ? obj.hostBoneName.trim() : "";
    const guestBoneName = typeof obj.guestBoneName === "string" ? obj.guestBoneName.trim() : "";
    if (!hostBoneName || !guestBoneName) return null;
    const id =
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id.trim()
        : `edge_migrated_${index}`;
    return {
      id,
      hostModelId,
      hostBoneName,
      guestModelId,
      guestBoneName,
      enabled: obj.enabled !== false,
    };
  } catch {
    return null;
  }
}

function normalizeTemplate(raw: unknown, index: number): AttachmentTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;
  const bindings = Array.isArray(obj.bindings)
    ? obj.bindings.map((item, i) => normalizeBinding(item, i)).filter((item): item is ModelBinding => item !== null)
    : [];
  const edges = Array.isArray(obj.edges)
    ? obj.edges.map((item, i) => normalizeEdge(item, i)).filter((item): item is AttachmentEdge => item !== null)
    : [];
  try {
    return buildAttachmentTemplate({
      id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `template-${index}`,
      name,
      description: typeof obj.description === "string" ? obj.description : "",
      unitHint: typeof obj.unitHint === "string" ? obj.unitHint : null,
      bindings,
      edges,
      primaryModelId:
        typeof obj.primaryModelId === "string" && obj.primaryModelId.trim()
          ? obj.primaryModelId
          : null,
    });
  } catch {
    // Soft-load: skip corrupt templates rather than failing the whole library.
    return null;
  }
}

export function normalizeAttachmentTemplateLibrary(input: unknown): AttachmentTemplateLibrary {
  if (!input || typeof input !== "object" || !Array.isArray((input as AttachmentTemplateLibrary).templates)) {
    return createDefaultLibrary();
  }
  const library = input as AttachmentTemplateLibrary;
  const templates = library.templates
    .map((template, index) => normalizeTemplate(template, index))
    .filter((template): template is AttachmentTemplate => template !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    version:
      typeof library.version === "number" ? library.version : ATTACHMENT_TEMPLATE_LIBRARY_VERSION,
    templates,
  };
}

async function saveNormalizedLibrary(library: AttachmentTemplateLibrary): Promise<AttachmentTemplateLibrary> {
  const normalized = normalizeAttachmentTemplateLibrary({
    version: ATTACHMENT_TEMPLATE_LIBRARY_VERSION,
    templates: library.templates,
  });
  const store = await load(CONFIG_STORE_NAME);
  await store.set(TEMPLATE_LIBRARY_KEY, normalized);
  await store.save();
  return normalized;
}

export async function loadAttachmentTemplateLibrary(): Promise<AttachmentTemplateLibrary> {
  const store = await load(CONFIG_STORE_NAME);
  const raw = await store.get(TEMPLATE_LIBRARY_KEY);
  const library = normalizeAttachmentTemplateLibrary(raw);
  await store.set(TEMPLATE_LIBRARY_KEY, library);
  await store.save();
  return library;
}

export async function saveAttachmentTemplateLibrary(
  library: AttachmentTemplateLibrary,
): Promise<void> {
  await saveNormalizedLibrary(library);
}

export async function upsertAttachmentTemplate(
  template: AttachmentTemplate,
): Promise<AttachmentTemplateLibrary> {
  const library = await loadAttachmentTemplateLibrary();
  const nextTemplate = buildAttachmentTemplate({
    id: template.id,
    name: template.name,
    description: template.description,
    unitHint: template.unitHint,
    bindings: template.bindings,
    edges: template.edges,
    primaryModelId: template.primaryModelId,
  });
  const templates = library.templates.filter((item) => item.id !== nextTemplate.id);
  // Also replace by name to mirror NUMATB upsert convenience.
  const withoutName = templates.filter(
    (item) => item.name.toLowerCase() !== nextTemplate.name.toLowerCase(),
  );
  withoutName.push(nextTemplate);
  withoutName.sort((left, right) => left.name.localeCompare(right.name));
  return saveNormalizedLibrary({
    version: ATTACHMENT_TEMPLATE_LIBRARY_VERSION,
    templates: withoutName,
  });
}

export async function deleteAttachmentTemplate(
  templateId: string,
): Promise<AttachmentTemplateLibrary> {
  const library = await loadAttachmentTemplateLibrary();
  return saveNormalizedLibrary({
    version: ATTACHMENT_TEMPLATE_LIBRARY_VERSION,
    templates: library.templates.filter((template) => template.id !== templateId),
  });
}
