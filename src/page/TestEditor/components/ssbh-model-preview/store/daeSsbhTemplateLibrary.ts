import { Store } from "@tauri-apps/plugin-store";
import {
  cloneNumatbFile,
  createEmptyNumatbFile,
  type NumatbTemplateDefinition,
  type NumatbTemplateLibrary,
} from "../daeSsbhTypes";

const TEMPLATE_LIBRARY_STORE_NAME = "ssbh-dae-template-library.json";
const TEMPLATE_LIBRARY_KEY = "templateLibrary";
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
  return {
    version: typeof library.version === "number" ? library.version : TEMPLATE_LIBRARY_VERSION,
    templates: library.templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description ?? "",
      sourceFileName: template.sourceFileName ?? null,
      updatedAt: template.updatedAt,
      mayaFile: cloneNumatbFile(template.mayaFile ?? createEmptyNumatbFile()),
      nustFile: cloneNumatbFile(template.nustFile ?? createEmptyNumatbFile()),
    })),
  };
}

export async function loadNumatbTemplateLibrary(): Promise<NumatbTemplateLibrary> {
  const store = await Store.load(TEMPLATE_LIBRARY_STORE_NAME);
  const raw = await store.get(TEMPLATE_LIBRARY_KEY);
  const library = normalizeTemplateLibrary(raw);
  await store.set(TEMPLATE_LIBRARY_KEY, library);
  await store.save();
  return library;
}

export async function saveNumatbTemplateLibrary(library: NumatbTemplateLibrary): Promise<void> {
  const store = await Store.load(TEMPLATE_LIBRARY_STORE_NAME);
  await store.set(TEMPLATE_LIBRARY_KEY, {
    version: TEMPLATE_LIBRARY_VERSION,
    templates: library.templates,
  });
  await store.save();
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
