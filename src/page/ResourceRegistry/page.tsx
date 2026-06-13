import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import { useConfigStore } from "@/store/configStore";
import { ResourceRegistryView } from "@/page/TestEditor/components/resource-registry/ResourceRegistryView";

const WORKSPACE_STORE_KEY = "resourceRegistryWorkspacePath";

export default function ResourceRegistryPage() {
  const extractOutputPath = useConfigStore((s) => s.extractOutputPath);
  const getSetting = useConfigStore((s) => s.getSetting);
  const setSetting = useConfigStore((s) => s.setSetting);
  const store = useConfigStore((s) => s.store);

  const [workspacePath, setWorkspacePath] = useState("");

  useEffect(() => {
    if (!store) return;
    void (async () => {
      const saved = await getSetting<string>(WORKSPACE_STORE_KEY);
      if (saved) {
        setWorkspacePath(saved);
      } else if (extractOutputPath) {
        setWorkspacePath(extractOutputPath);
      }
    })();
  }, [store, getSetting, extractOutputPath]);

  const handleWorkspaceChange = (value: string) => {
    setWorkspacePath(value);
    void setSetting(WORKSPACE_STORE_KEY, value);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 space-y-1">
        <h1 className="text-xl font-semibold">Resource Registry</h1>
        <p className="text-xs text-muted-foreground max-w-3xl">
          CRC32 name database for stage, unit, and prop assets. Workspace file overrides global
          defaults.
        </p>
      </div>

      <div className="shrink-0 max-w-3xl space-y-1">
        <Label className="text-xs">Workspace folder</Label>
        <FilePathInput
          value={workspacePath}
          onChange={(e) => handleWorkspaceChange(e.target.value)}
          picker={{
            kind: "folder",
            title: "Select workspace folder",
            defaultPathKey: WORKSPACE_STORE_KEY,
            persistDefaultPath: true,
          }}
          placeholder="Folder containing resource_registry.json"
          className="h-8 text-xs font-mono"
        />
        <p className="text-[10px] text-muted-foreground">
          Workspace entries are saved to resource_registry.json in this folder.
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <ResourceRegistryView folderPath={workspacePath} showTitle={false} />
      </div>
    </div>
  );
}
