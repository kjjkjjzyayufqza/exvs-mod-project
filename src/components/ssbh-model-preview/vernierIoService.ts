import { invoke } from "@tauri-apps/api/core";
import type { TypedParamFile } from "@/page/TestEditor/components/param-editor/typedParamTypes";

/**
 * `vernier_table_*` control bin (thruster/effect table). It is a command-pool ParamBinary edited
 * through the generic typed-param IPC, reusing the same machinery as the TestEditor param editor.
 */
export const VERNIER_PARAM_TYPE = "vernier_table";

export async function vernierReadFile(filePath: string): Promise<TypedParamFile> {
  return invoke<TypedParamFile>("parse_typed_param_file", {
    path: filePath,
    paramType: VERNIER_PARAM_TYPE,
  });
}

export async function vernierWriteFile(payload: {
  filePath: string;
  data: TypedParamFile;
}): Promise<void> {
  await invoke("build_typed_param_file", {
    dataJson: payload.data,
    outputPath: payload.filePath,
    paramType: VERNIER_PARAM_TYPE,
  });
}

export type { TypedParamFile };
