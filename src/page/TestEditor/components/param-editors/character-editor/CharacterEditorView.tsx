import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { EntryListPanel } from "../shared/EntryListPanel";
import { EditorStatusBar } from "../shared/EditorStatusBar";
import { CharacterPropertyPanel } from "./CharacterPropertyPanel";
import { StatRadarChart } from "./StatRadarChart";
import { useCharacterEditorStore } from "./CharacterEditorStore";
import { formatHash } from "@/models/commandTable";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";
import type { EditorEntryRow } from "../shared/types";

const STORE_KEY = "paramEditors.v2.fp.characterparam";
const PARAM_TYPE = "characterparam";

interface CharacterEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void;
}

export function CharacterEditorView({
  onUnsavedChanges,
}: CharacterEditorViewProps) {
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const data = useCharacterEditorStore((s) => s.data);
  const selectedIndex = useCharacterEditorStore((s) => s.selectedIndex);
  const dirty = useCharacterEditorStore((s) => s.dirty);
  const validationMessages = useCharacterEditorStore(
    (s) => s.validationMessages,
  );

  const store = useCharacterEditorStore;

  useEffect(() => {
    onUnsavedChanges?.(dirty);
  }, [dirty, onUnsavedChanges]);

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setLoading(true);
      try {
        const data = await invoke<TypedParamFile>("parse_typed_param_file", {
          path,
          paramType: PARAM_TYPE,
        });
        store.getState().setData(data, path);
        toast.success(`Loaded ${PARAM_TYPE} (${data.entries.length} entries)`);
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

  const renderEntryLabel = (row: EditorEntryRow) => {
    const cost =
      typeof row.entry.baseUnitCost === "number" ? row.entry.baseUnitCost : 0;
    return (
      <div className="flex flex-col">
        <span className="font-mono text-[10px]">
          {formatHash(row.entryId)}
        </span>
        <span className="text-[9px] text-muted-foreground">
          Cost {cost}
        </span>
      </div>
    );
  };

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
            title: "Select characterparam file",
            filters: [{ name: "Param", extensions: ["bin"] }],
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

        <div className="flex min-h-0 items-start justify-center overflow-y-auto border-x">
          {data ? (
            <StatRadarChart entry={entry} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Click the file path input above to select a characterparam.bin
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden">
          {entry ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CharacterPropertyPanel
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
