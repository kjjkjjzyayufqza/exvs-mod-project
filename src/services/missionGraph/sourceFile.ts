import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import type { MissionGraph } from "./graph";
import { graphToModel } from "./graph";
import { layoutGraph } from "./editor";
import { runGraphTask } from "./workerClient";

export interface MissionSourceFile {
  path: string;
  source: string;
  savedModel: string;
}

export function sourceModelKey(graph: MissionGraph): string | null {
  try { return JSON.stringify(graphToModel(graph)); } catch { return null; }
}

export async function loadMissionSourceAtPath(path: string, task: { current: ReturnType<typeof runGraphTask> | null }) {
  const source = await invoke<string>("read_mission_source", { path });
  const job = runGraphTask({ kind: "c", source });
  task.current = job;
  const result = await job.promise;
  const graph = layoutGraph({ ...result.graph, name: path.split(/[\\/]/).at(-1)!.slice(0, 120) });
  const file: MissionSourceFile = { path, source, savedModel: sourceModelKey(graph)! };
  return { file, graph };
}

export async function openMissionFile(task: { current: ReturnType<typeof runGraphTask> | null }) {
  const path = await open({ multiple: false, filters: [{ name: "Mission MSC C", extensions: ["c"] }] });
  if (typeof path !== "string") return null;
  return loadMissionSourceAtPath(path, task);
}

export async function saveMissionFile(file: MissionSourceFile, source: string, savedModel: string, saveAs = false): Promise<MissionSourceFile | null> {
  const path = saveAs ? await save({ defaultPath: file.path, filters: [{ name: "Mission MSC C", extensions: ["c"] }] }) : file.path;
  if (!path) return null;
  // The loaded file always uses its original snapshot. Another destination is
  // explicitly chosen through the native dialog, including overwrite confirmation.
  const samePath = path.replaceAll("\\", "/").toLowerCase() === file.path.replaceAll("\\", "/").toLowerCase();
  const expected = samePath ? file.source : await exists(path) ? await invoke<string>("read_mission_source", { path }) : null;
  await invoke("save_mission_source", { path, expected, source });
  return { path, source, savedModel };
}
