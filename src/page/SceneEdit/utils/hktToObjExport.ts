import { open } from "@tauri-apps/plugin-dialog";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import {
  SCENE_HKT_TO_OBJ_INPUT_DIALOG_PATH_KEY,
  SCENE_HKT_TO_OBJ_OUTPUT_DIALOG_PATH_KEY,
} from "./sceneEditorSettings";
import { convertHktToObj } from "./sceneSessionService";

function fileStemFromPath(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? "collision";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function joinPath(dir: string, fileName: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.replace(/[/\\]+$/, "");
  return `${trimmed}${sep}${fileName}`;
}

export interface HktToObjExportResult {
  inputPath: string;
  outputPath: string;
  summary: string;
}

/**
 * Pick an HKT file and output directory, then export `{stem}.obj` via Havok SDK.
 */
export async function runHktToObjExport(): Promise<HktToObjExportResult | null> {
  const selected = await open({
    title: "Select HKT collision file",
    filters: [{ name: "Havok collision", extensions: ["hkt"] }],
    multiple: false,
    defaultPath: await getStoredDialogDefaultPath(SCENE_HKT_TO_OBJ_INPUT_DIALOG_PATH_KEY),
  });
  const inputPath =
    typeof selected === "string" ? selected : Array.isArray(selected) ? selected[0] : null;
  if (!inputPath) return null;
  await rememberStoredDialogSelection(SCENE_HKT_TO_OBJ_INPUT_DIALOG_PATH_KEY, inputPath, "file");

  const outputDir = await open({
    title: "Select output folder for OBJ",
    directory: true,
    multiple: false,
    defaultPath: await getStoredDialogDefaultPath(SCENE_HKT_TO_OBJ_OUTPUT_DIALOG_PATH_KEY),
  });
  const dir =
    typeof outputDir === "string" ? outputDir : Array.isArray(outputDir) ? outputDir[0] : null;
  if (!dir) return null;
  await rememberStoredDialogSelection(SCENE_HKT_TO_OBJ_OUTPUT_DIALOG_PATH_KEY, dir, "directory");

  const outputPath = joinPath(dir, `${fileStemFromPath(inputPath)}.obj`);
  const summary = await convertHktToObj(inputPath, outputPath);
  return { inputPath, outputPath, summary };
}
