import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { FilePathInput } from "@/components/ui/filePathInput";
import { formatHash } from "@/models/commandTable";
import {
  PARAM_KIND_LABELS,
  followChildBulletChain,
  resolveBulletCrossReferences,
  type ParamKind,
} from "@/lib/gameAlgorithms/crossParamResolver";
import { getMoveTypeLabel } from "@/lib/gameAlgorithms/moveTypes";
import type {
  TypedParamEntry,
  TypedParamFile,
} from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import { CrossReferencePanel } from "../shared/CrossReferencePanel";
import { PropertyGroup } from "../shared/PropertyGroup";
import {
  useBulletEditorStore,
  type BulletSiblingKind,
} from "./BulletEditorStore";

interface SiblingFileConfig {
  kind: BulletSiblingKind;
  /** Param type string accepted by the parse_typed_param_file command. */
  paramType: string;
  storeKey: string;
}

const SIBLING_FILE_CONFIGS: SiblingFileConfig[] = [
  {
    kind: "interactionid",
    paramType: "interactionid",
    storeKey: "paramEditors.v2.fp.bulletWorkbench.interactionid",
  },
  {
    kind: "hitgroupiddef",
    paramType: "hitgroupiddef",
    storeKey: "paramEditors.v2.fp.bulletWorkbench.hitgroupiddef",
  },
  {
    kind: "projectileDepictionTable",
    paramType: "projectile_depiction_table",
    storeKey: "paramEditors.v2.fp.bulletWorkbench.projectile_depiction_table",
  },
];

const NAVIGABLE_KINDS: ParamKind[] = ["bulletparam"];

interface SiblingFileRowProps {
  config: SiblingFileConfig;
  workspaceDefaultPath?: string;
}

function SiblingFileRow({ config, workspaceDefaultPath }: SiblingFileRowProps) {
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const file = useBulletEditorStore((s) => s.siblingFiles[config.kind]);

  const loadSibling = async (p: string) => {
    if (!p.trim()) return;
    setLoading(true);
    try {
      const data = await invoke<TypedParamFile>("parse_typed_param_file", {
        path: p,
        paramType: config.paramType,
      });
      useBulletEditorStore.getState().setSiblingFile(config.kind, data, p);
      toast.success(
        `Loaded ${config.paramType} (${data.entries.length} entries)`,
      );
    } catch (e) {
      toast.error(`Failed to load ${config.paramType}: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {PARAM_KIND_LABELS[config.kind]}
        </span>
        {loading ? (
          <span className="text-[9px] text-muted-foreground">Loading...</span>
        ) : file ? (
          <span className="text-[9px] text-green-400">
            {file.entries.length} entries
          </span>
        ) : (
          <span className="text-[9px] text-yellow-500/80">Not loaded</span>
        )}
      </div>
      <FilePathInput
        className="h-6 w-full font-mono text-[10px]"
        storeKey={config.storeKey}
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder={`Select ${config.paramType}.bin`}
        picker={{
          kind: "file",
          title: `Select ${config.paramType} file`,
          filters: [{ name: "Param", extensions: ["bin"] }],
          defaultPath: workspaceDefaultPath,
        }}
        onPickedValue={(v) => {
          const p = Array.isArray(v) ? v[0] : v;
          if (typeof p === "string" && p) {
            setPath(p);
            void loadSibling(p);
          }
        }}
      />
    </div>
  );
}

interface ChildBulletChainPanelProps {
  chain: Array<{
    depth: number;
    hash: number;
    entry: TypedParamEntry | undefined;
  }>;
  onSelectHash: (hash: number) => void;
}

function ChildBulletChainPanel({
  chain,
  onSelectHash,
}: ChildBulletChainPanelProps) {
  return (
    <PropertyGroup label={`Child Bullet Chain (${chain.length})`} defaultOpen>
      {chain.length === 0 ? (
        <div className="text-[10px] text-muted-foreground">
          No child bullet chain (childBulletHash is 0)
        </div>
      ) : (
        chain.map((link) => {
          const resolved = link.entry !== undefined;
          const moveTypeText = !resolved
            ? null
            : typeof link.entry?.moveType === "number"
              ? getMoveTypeLabel(Math.trunc(link.entry.moveType))
              : "moveType missing";
          return (
            <div
              key={link.depth}
              className="flex items-center gap-2 rounded border bg-muted/10 px-2 py-1.5"
            >
              <span className="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                L{link.depth}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px]">
                  {formatHash(link.hash)}
                </div>
                {moveTypeText && (
                  <div className="text-[9px] text-muted-foreground">
                    {moveTypeText}
                  </div>
                )}
              </div>
              {resolved ? (
                <button
                  type="button"
                  className="text-[10px] text-blue-400 hover:underline"
                  onClick={() => onSelectHash(link.hash)}
                >
                  Go to
                </button>
              ) : (
                <span className="text-[9px] text-red-400">Missing entry</span>
              )}
            </div>
          );
        })
      )}
    </PropertyGroup>
  );
}

interface BulletCrossRefPanelProps {
  workspaceDefaultPath?: string;
}

/**
 * Cross-reference sidebar for the bullet editor: sibling param file loaders,
 * resolved hash references for the selected entry, and the child bullet chain.
 */
export function BulletCrossRefPanel({
  workspaceDefaultPath,
}: BulletCrossRefPanelProps) {
  const data = useBulletEditorStore((s) => s.data);
  const selectedIndex = useBulletEditorStore((s) => s.selectedIndex);
  const siblingFiles = useBulletEditorStore((s) => s.siblingFiles);

  const entry = data?.entries[selectedIndex];

  const loadedKinds = useMemo(() => {
    const kinds: ParamKind[] = ["bulletparam"];
    for (const config of SIBLING_FILE_CONFIGS) {
      if (siblingFiles[config.kind]) kinds.push(config.kind);
    }
    return kinds;
  }, [siblingFiles]);

  const references = useMemo(() => {
    if (!data || !entry) return [];
    const paramFiles: Partial<Record<ParamKind, TypedParamEntry[]>> = {
      bulletparam: data.entries,
    };
    for (const config of SIBLING_FILE_CONFIGS) {
      const file = siblingFiles[config.kind];
      if (file) paramFiles[config.kind] = file.entries;
    }
    return resolveBulletCrossReferences(entry, paramFiles);
  }, [data, entry, siblingFiles]);

  const childChain = useMemo(() => {
    if (!data || !entry) return [];
    return followChildBulletChain(entry, data.entries);
  }, [data, entry]);

  const navigateToBulletEntry = (hash: number) => {
    if (!data) return;
    const index = data.entries.findIndex(
      (e, i) => readTypedEntryId(e, i) === (hash >>> 0),
    );
    if (index < 0) {
      toast.error(
        `Bullet entry ${formatHash(hash)} not found in the loaded file`,
      );
      return;
    }
    useBulletEditorStore.getState().selectEntry(index);
  };

  if (!entry) {
    return (
      <div className="rounded-md border bg-card p-3 text-center text-[11px] text-muted-foreground">
        No bullet entry selected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <PropertyGroup label="Linked Param Files" defaultOpen>
        {SIBLING_FILE_CONFIGS.map((config) => (
          <SiblingFileRow
            key={config.kind}
            config={config}
            workspaceDefaultPath={workspaceDefaultPath}
          />
        ))}
      </PropertyGroup>

      <CrossReferencePanel
        references={references}
        loadedKinds={loadedKinds}
        navigableKinds={NAVIGABLE_KINDS}
        onNavigateToEntry={(kind, hash) => {
          if (kind === "bulletparam") navigateToBulletEntry(hash);
        }}
      />

      <ChildBulletChainPanel
        chain={childChain}
        onSelectHash={navigateToBulletEntry}
      />
    </div>
  );
}
