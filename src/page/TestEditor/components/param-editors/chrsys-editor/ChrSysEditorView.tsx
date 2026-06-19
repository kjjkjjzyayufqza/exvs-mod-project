import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { EntryListPanel } from "../shared/EntryListPanel";
import { EditorStatusBar } from "../shared/EditorStatusBar";
import { HashCategoryPanel } from "./HashCategoryPanel";
import { ChrSysPropertyPanel } from "./ChrSysPropertyPanel";
import { useChrSysEditorStore } from "./ChrSysEditorStore";

const STORE_KEY = "paramEditors.v2.fp.chrsysparam";

interface ChrSysEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void;
  workspaceDefaultPath?: string;
}

export function ChrSysEditorView({ onUnsavedChanges, workspaceDefaultPath }: ChrSysEditorViewProps) {
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const data = useChrSysEditorStore((s) => s.data);
  const selectedIndex = useChrSysEditorStore((s) => s.selectedIndex);
  const dirty = useChrSysEditorStore((s) => s.dirty);
  const validationMessages = useChrSysEditorStore(
    (s) => s.validationMessages,
  );

  const store = useChrSysEditorStore;

  useEffect(() => {
    onUnsavedChanges?.(dirty);
  }, [dirty, onUnsavedChanges]);

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setLoading(true);
      try {
        const raw = await invoke<unknown>("parse_chrsysparam_file", { path });
        store.getState().setData(raw, path);
        const entryCount = store.getState().data?.entries.length ?? 0;
        toast.success(`Loaded chrsysparam (${entryCount} entries)`);
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
    if (!current.rawData || !current.filePath.trim()) return;
    setSaving(true);
    try {
      await invoke("build_chrsysparam_file", {
        fileJson: current.rawData,
        outputPath: current.filePath,
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
            title: "Select ChrSysParam file",
            filters: [
              { name: "ChrSysParam", extensions: ["csyspm"] },
            ],
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
          <span className="text-[11px] text-muted-foreground">Loading...</span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_320px]">
        <EntryListPanel
          entries={data?.entries ?? []}
          selectedIndex={selectedIndex}
          onSelect={(i) => store.getState().selectEntry(i)}
        />

        <div className="min-h-0 overflow-hidden border-x">
          <HashCategoryPanel entry={entry} />
        </div>

        <div className="min-h-0 overflow-hidden">
          <ChrSysPropertyPanel
            entry={entry}
            onFieldChange={(key, value) =>
              store.getState().updateField(key, value)
            }
          />
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
