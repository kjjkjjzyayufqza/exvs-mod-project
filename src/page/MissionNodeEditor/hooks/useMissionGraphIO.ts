import { confirm } from "@tauri-apps/plugin-dialog";

export async function mayReplaceUnsaved(dirty: boolean) {
  return !dirty || await confirm("Discard unsaved mission source changes and open another file?", { title: "Mission Node Editor", kind: "warning" });
}

