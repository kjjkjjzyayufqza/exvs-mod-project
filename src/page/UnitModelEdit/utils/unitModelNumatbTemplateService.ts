import { ssbhTemplateReadNumatb } from "@/components/ssbh-model-preview/ssbhDaeIoService";
import {
  cloneNumatbFile,
  type NumatbTemplateDefinition,
  type NumatbTemplateLibrary,
} from "@/components/ssbh-model-preview/daeSsbhTypes";
import {
  resolveNumatbProfilePaths,
  type NumatbProfilePaths,
} from "@/components/ssbh-model-preview/numatbEditorUtils";
import { normalizeMatlDataJson } from "@/components/ssbh-model-preview/store/numatbProfileMigration";
import {
  loadNumatbTemplateLibrary,
  upsertNumatbTemplate,
} from "@/components/ssbh-model-preview/store/daeSsbhTemplateLibrary";
import { useDaeSsbhSessionStore } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import type { MatlDataJson } from "@/components/ssbh-model-preview/types";

import { resolveUnitModelNodeAbsPath } from "./unitModelNodePaths";
import type { UnitModelTreeNode } from "./unitModelStructureTree";

/** Relative fileUrls of every `.numatb` item under a model group (depth-first). */
export function collectModelNumatbRelativeUrls(model: UnitModelTreeNode): string[] {
  const urls: string[] = [];
  const walk = (node: UnitModelTreeNode) => {
    if (node.kind === "item") {
      const fileType = (node.fileType ?? "").toLowerCase();
      const fileUrl = node.fileUrl?.trim();
      if (fileUrl && (fileType === ".numatb" || fileUrl.toLowerCase().endsWith(".numatb"))) {
        urls.push(fileUrl);
      }
      return;
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(model);
  return urls;
}

/**
 * Resolve absolute maya/nust numatb paths for a model group from structure item
 * fileUrls. Prefers `__maya__` / base `__nust__` via shared path heuristics.
 */
export function resolveModelNumatbProfilePaths(
  structureJsonPath: string,
  model: UnitModelTreeNode,
): NumatbProfilePaths {
  const absolutePaths = collectModelNumatbRelativeUrls(model).map((fileUrl) =>
    resolveUnitModelNodeAbsPath(structureJsonPath, fileUrl),
  );
  return resolveNumatbProfilePaths(absolutePaths);
}

export type CreateNumatbTemplateFromUnitModelInput = {
  structureJsonPath: string;
  model: UnitModelTreeNode;
  /** Defaults to the model group label. */
  templateName?: string;
  description?: string;
};

export type CreateNumatbTemplateFromUnitModelResult = {
  template: NumatbTemplateDefinition;
  templateLibrary: NumatbTemplateLibrary;
  paths: { maya: string; nust: string };
  replacedExisting: boolean;
};

function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function findTemplateByName(
  library: NumatbTemplateLibrary,
  name: string,
): NumatbTemplateDefinition | null {
  const key = name.trim().toLowerCase();
  return library.templates.find((template) => template.name.trim().toLowerCase() === key) ?? null;
}

export function buildNumatbTemplateDefinition(input: {
  name: string;
  description: string;
  sourceFileName: string | null;
  mayaFile: MatlDataJson;
  nustFile: MatlDataJson;
  existingId?: string | null;
}): NumatbTemplateDefinition {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Template name is required.");
  }
  return {
    id: input.existingId?.trim() || crypto.randomUUID(),
    name,
    description: input.description.trim(),
    sourceFileName: input.sourceFileName?.trim() || null,
    updatedAt: new Date().toISOString(),
    mayaFile: cloneNumatbFile(normalizeMatlDataJson(input.mayaFile)),
    nustFile: cloneNumatbFile(normalizeMatlDataJson(input.nustFile)),
  };
}

/**
 * Read the model's `__maya__` + `__nust__` numatb files and upsert them into the
 * shared NUMATB template library used by FBX/DAE SSBH import.
 *
 * If a template with the same name already exists, its id is reused so re-creating
 * from an updated model overwrites the prior entry instead of duplicating names.
 */
export async function createNumatbTemplateFromUnitModel(
  input: CreateNumatbTemplateFromUnitModelInput,
): Promise<CreateNumatbTemplateFromUnitModelResult> {
  const structureJsonPath = input.structureJsonPath.trim();
  if (!structureJsonPath) {
    throw new Error("Structure JSON path is required.");
  }

  const paths = resolveModelNumatbProfilePaths(structureJsonPath, input.model);
  if (!paths.maya || !paths.nust) {
    const missing: string[] = [];
    if (!paths.maya) missing.push("__maya__.numatb");
    if (!paths.nust) missing.push("__nust__.numatb");
    throw new Error(
      `Model "${input.model.label}" is missing ${missing.join(" and ")}. ` +
        "Both Maya and Nust material profiles are required to create a template.",
    );
  }

  const [mayaFile, nustFile] = await Promise.all([
    ssbhTemplateReadNumatb(paths.maya),
    ssbhTemplateReadNumatb(paths.nust),
  ]);

  const templateName = (input.templateName ?? input.model.label).trim();
  if (!templateName) {
    throw new Error("Template name is required.");
  }

  const description =
    input.description?.trim() ||
    `Created from unit model "${input.model.label}" (maya + nust numatb).`;

  const existingLibrary = await loadNumatbTemplateLibrary();
  const existing = findTemplateByName(existingLibrary, templateName);
  const template = buildNumatbTemplateDefinition({
    name: templateName,
    description,
    sourceFileName: basenameOf(paths.nust),
    mayaFile,
    nustFile,
    existingId: existing?.id ?? null,
  });

  const templateLibrary = await upsertNumatbTemplate(template);

  // Keep the import session store in sync so the FBX import template dropdown
  // sees the new entry without requiring a manual reload.
  useDaeSsbhSessionStore.setState({
    templateLibrary,
    selectedTemplateId: template.id,
    templateLibraryError: null,
  });

  return {
    template,
    templateLibrary,
    paths: { maya: paths.maya, nust: paths.nust },
    replacedExisting: existing != null,
  };
}
