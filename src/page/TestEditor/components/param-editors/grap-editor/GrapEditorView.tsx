import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { EntryListPanel } from "../shared/EntryListPanel";
import { EditorStatusBar } from "../shared/EditorStatusBar";
import { GrapPropertyPanel } from "./GrapPropertyPanel";
import { GrabRangeVisualizer } from "./GrabRangeVisualizer";
import { useGrapEditorStore } from "./GrapEditorStore";
import { formatHash } from "@/models/commandTable";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";
import type { EditorEntryRow } from "../shared/types";

const STORE_KEY = "paramEditors.v2.fp.grapparam";
const PARAM_TYPE = "grapparam";

interface GrapEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void;
  workspaceDefaultPath?: string;
}

export function GrapEditorView({ onUnsavedChanges, workspaceDefaultPath }: GrapEditorViewProps) {
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const data = useGrapEditorStore((s) => s.data);
  const selectedIndex = useGrapEditorStore((s) => s.selectedIndex);
  const dirty = useGrapEditorStore((s) => s.dirty);
  const validationMessages = useGrapEditorStore((s) => s.validationMessages);

  const store = useGrapEditorStore;

  useEffect(() => {
    onUnsavedChanges?.(dirty);
  }, [dirty, onUnsavedChanges]);

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setLoading(true);
      try {
        const result = await invoke<TypedParamFile>("parse_typed_param_file", {
          path,
          paramType: PARAM_TYPE,
        });
        store.getState().setData(result, path);
        toast.success(`Loaded ${PARAM_TYPE} (${result.entries.length} entries)`);
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

  const renderEntryLabel = (row: EditorEntryRow) => (
    <span className="font-mono text-[10px]">{formatHash(row.entryId)}</span>
  );

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
            title: "Select grapparam file",
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
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_320px]">
        <EntryListPanel
          entries={data?.entries ?? []}
          selectedIndex={selectedIndex}
          onSelect={(i) => store.getState().selectEntry(i)}
          renderLabel={renderEntryLabel}
        />

        <div className="min-h-0 border-x">
          {data ? (
            <GrabRangeVisualizer entry={entry} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Click the file path input above to select a grapparam.bin
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden">
          {entry ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <GrapPropertyPanel
                entry={entry}
                fieldSpecs={data?.fieldSpecs}
                onFieldChange={(key, value) =>
                  store.getState().updateField(key, value)
                }
              />
            </div>
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
