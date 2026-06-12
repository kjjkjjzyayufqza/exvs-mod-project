import { load } from "@tauri-apps/plugin-store";
import {
  createEmptyNumatbFile,
  type NumatbTemplateDefinition,
  type NumatbTemplateLibrary,
} from "../daeSsbhTypes";
import { normalizeMatlDataJson } from "./numatbProfileMigration";

const CONFIG_STORE_NAME = "settings.json";
const TEMPLATE_LIBRARY_KEY = "ssbhDaeNumatbTemplateLibrary";
const TEMPLATE_LIBRARY_MIGRATED_KEY = "ssbhDaeNumatbTemplateLibraryMigrated";
const LEGACY_TEMPLATE_LIBRARY_STORE_NAME = "ssbh-dae-template-library.json";
const LEGACY_TEMPLATE_LIBRARY_KEY = "templateLibrary";
const TEMPLATE_LIBRARY_VERSION = 1;

function createDefaultLibrary(): NumatbTemplateLibrary {
  return {
    version: TEMPLATE_LIBRARY_VERSION,
    templates: [],
  };
}

function normalizeTemplateLibrary(input: unknown): NumatbTemplateLibrary {
  if (!input || typeof input !== "object" || !Array.isArray((input as NumatbTemplateLibrary).templates)) {
    return createDefaultLibrary();
  }
  const library = input as NumatbTemplateLibrary;
  const templates = library.templates
    .map((template, index) => {
      const name = typeof template.name === "string" ? template.name.trim() : "";
      if (!name) return null;
      const id = typeof template.id === "string" && template.id.trim() ? template.id : `template-${index}`;
      return {
        id,
        name,
        description: typeof template.description === "string" ? template.description : "",
        sourceFileName: typeof template.sourceFileName === "string" ? template.sourceFileName : null,
        updatedAt: typeof template.updatedAt === "string" ? template.updatedAt : new Date(0).toISOString(),
        mayaFile: normalizeMatlDataJson(template.mayaFile ?? createEmptyNumatbFile()),
        nustFile: normalizeMatlDataJson(template.nustFile ?? createEmptyNumatbFile()),
      };
    })
    .filter((template): template is NumatbTemplateDefinition => template !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    version: typeof library.version === "number" ? library.version : TEMPLATE_LIBRARY_VERSION,
    templates,
  };
}

async function loadLegacyTemplateLibrary(): Promise<NumatbTemplateLibrary | null> {
  try {
    const store = await load(LEGACY_TEMPLATE_LIBRARY_STORE_NAME);
    const raw = await store.get(LEGACY_TEMPLATE_LIBRARY_KEY);
    const library = normalizeTemplateLibrary(raw);
    return library.templates.length > 0 ? library : null;
  } catch {
    return null;
  }
}

async function saveNormalizedTemplateLibrary(library: NumatbTemplateLibrary): Promise<NumatbTemplateLibrary> {
  const normalized = normalizeTemplateLibrary({
    version: TEMPLATE_LIBRARY_VERSION,
    templates: library.templates,
  });
  const store = await load(CONFIG_STORE_NAME);
  await store.set(TEMPLATE_LIBRARY_KEY, normalized);
  await store.set(TEMPLATE_LIBRARY_MIGRATED_KEY, true);
  await store.save();
  return normalized;
}

export async function loadNumatbTemplateLibrary(): Promise<NumatbTemplateLibrary> {
  const store = await load(CONFIG_STORE_NAME);
  const raw = await store.get(TEMPLATE_LIBRARY_KEY);
  const migrated = await store.get<boolean>(TEMPLATE_LIBRARY_MIGRATED_KEY);
  let library = normalizeTemplateLibrary(raw);
  if (library.templates.length === 0 && migrated !== true) {
    library = (await loadLegacyTemplateLibrary()) ?? library;
  }
  await store.set(TEMPLATE_LIBRARY_KEY, library);
  await store.set(TEMPLATE_LIBRARY_MIGRATED_KEY, true);
  await store.save();
  return library;
}

export async function saveNumatbTemplateLibrary(library: NumatbTemplateLibrary): Promise<void> {
  await saveNormalizedTemplateLibrary(library);
}

export async function upsertNumatbTemplate(template: NumatbTemplateDefinition): Promise<NumatbTemplateLibrary> {
  const library = await loadNumatbTemplateLibrary();
  const templates = library.templates.filter((item) => item.id !== template.id);
  templates.push(template);
  templates.sort((left, right) => left.name.localeCompare(right.name));
  const next = {
    version: TEMPLATE_LIBRARY_VERSION,
    templates,
  };
  await saveNumatbTemplateLibrary(next);
  return next;
}

export async function deleteNumatbTemplate(templateId: string): Promise<NumatbTemplateLibrary> {
  const library = await loadNumatbTemplateLibrary();
  const next = {
    version: TEMPLATE_LIBRARY_VERSION,
    templates: library.templates.filter((template) => template.id !== templateId),
  };
  await saveNumatbTemplateLibrary(next);
  return next;
}
