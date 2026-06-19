import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { EntryListPanel } from "../shared/EntryListPanel";
import { EditorStatusBar } from "../shared/EditorStatusBar";
import { InteractionMatrix } from "./InteractionMatrix";
import { HitGroupPropertyPanel } from "./HitGroupPropertyPanel";
import { useHitGroupEditorStore } from "./HitGroupEditorStore";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

const STORE_KEY = "paramEditors.v2.fp.hitgroupiddef";
const PARAM_TYPE = "hitgroupiddef";

interface HitGroupEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void;
  workspaceDefaultPath?: string;
}

export function HitGroupEditorView({
  onUnsavedChanges,
  workspaceDefaultPath,
}: HitGroupEditorViewProps) {
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const data = useHitGroupEditorStore((s) => s.data);
  const selectedIndex = useHitGroupEditorStore((s) => s.selectedIndex);
  const dirty = useHitGroupEditorStore((s) => s.dirty);
  const validationMessages = useHitGroupEditorStore(
    (s) => s.validationMessages,
  );

  const store = useHitGroupEditorStore;

  useEffect(() => {
    onUnsavedChanges?.(dirty);
  }, [dirty, onUnsavedChanges]);

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setLoading(true);
      try {
        const parsed = await invoke<TypedParamFile>(
          "parse_typed_param_file",
          { path, paramType: PARAM_TYPE },
        );
        store.getState().setData(parsed, path);
        toast.success(
          `Loaded ${PARAM_TYPE} (${parsed.entries.length} entries)`,
        );
      } catch (e) {
        toast.error(`Failed to load: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [store],
  );

  const saveFile = async () => {
    const current = store.getState();
    if (!current.data || !current.filePath.trim()) return;
    setSaving(true);
    try {
      await invoke("build_typed_param_file", {
        dataJson: current.data,
        outputPath: current.filePath,
        paramType: PARAM_TYPE,
      });
      store.setState({ dirty: false });
      toast.success("Saved successfully");
    } catch (e) {
      toast.error(`Failed to save: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const entry = data?.entries[selectedIndex] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <FilePathInput
          className="h-7 w-80 font-mono text-[11px]"
          storeKey={STORE_KEY}
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          picker={{
            kind: "file",
            title: "Select hitgroupiddef file",
            filters: [{ name: "Param", extensions: ["bin"] }],
            defaultPath: workspaceDefaultPath,
          }}
          onPickedValue={(v) => {
            const p = Array.isArray(v) ? v[0] : v;
            if (typeof p === "string" && p) {
              setFilePath(p);
              void loadFile(p);
            }
          }}
        />
        <Button
          size="sm"
          variant="default"
          className="h-7 gap-1 text-[11px]"
          onClick={saveFile}
          disabled={!dirty || saving}
        >
          <Save className="h-3 w-3" />
          {saving ? "Saving..." : "Save"}
        </Button>
        {loading && (
          <span className="text-[11px] text-muted-foreground">
            Loading...
          </span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_320px]">
        <EntryListPanel
          entries={data?.entries ?? []}
          selectedIndex={selectedIndex}
          onSelect={(i) => store.getState().selectEntry(i)}
        />

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-x p-4">
          {entry ? (
            <InteractionMatrix entry={entry} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Click the file path input above to select a hitgroupiddef.bin
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-hidden">
          {entry ? (
            <HitGroupPropertyPanel
              entry={entry}
              fieldSpecs={data?.fieldSpecs}
              onFieldChange={(key, value) =>
                store.getState().updateField(key, value)
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No entry selected
            </div>
          )}
        </div>
      </div>

      <EditorStatusBar
        entryCount={data?.entries.length ?? 0}
        selectedIndex={selectedIndex}
        modifiedCount={dirty ? 1 : 0}
        validationMessages={validationMessages}
      />
    </div>
  );
}
