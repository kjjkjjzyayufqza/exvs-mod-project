import { openPath } from "@tauri-apps/plugin-opener";
import { ExternalLink, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  EffectFolderHash,
  EffectFolderInventory,
  EffectFolderValidationResult,
} from "@/services/effectFolder/effectFolderService";
import type { EffectListItem } from "./effectFolderEditorUtils";
import { formatEffectFolderHash } from "./effectFolderEditorUtils";
import { EffectFolder3dPreview } from "./EffectFolder3dPreview";
import { EffectNutexbPreview } from "./EffectNutexbPreview";

type EffectFolderDetailPanelProps = {
  item: EffectListItem | null;
  inventory: EffectFolderInventory | null;
  inventoryWarnings: string[];
  validation: EffectFolderValidationResult | null;
  previewSuspended?: boolean;
  onOpenAsEffectProject?: (filePath: string) => void;
};

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-muted/60 py-1.5 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono">{value}</span>
    </div>
  );
}

function HashValue({ hash, align = "right" }: { hash: EffectFolderHash; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right font-mono" : "font-mono"}>
      <div className="text-[11px]">{hash.hex}</div>
      <div className="text-[10px] tabular-nums text-muted-foreground">{hash.signed}</div>
    </div>
  );
}

function HashMetadataRow({ label, hash }: { label: string; hash: EffectFolderHash }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-muted/60 py-1.5 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <HashValue hash={hash} />
    </div>
  );
}

function HashBadge({ hash }: { hash: EffectFolderHash }) {
  return (
    <Badge variant="outline" className="h-auto max-w-full whitespace-normal px-2 py-1 font-mono text-[10px] leading-tight">
      <span className="block">{hash.hex}</span>
      <span className="block tabular-nums text-muted-foreground">{hash.signed}</span>
    </Badge>
  );
}

function ModelIdTable({ hashes }: { hashes: EffectFolderHash[] }) {
  if (hashes.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No model IDs.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 text-[10px]">Hex</TableHead>
            <TableHead className="h-8 text-[10px]">Int32</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hashes.map((hash, index) => (
            <TableRow key={`${hash.hex}-${hash.signed}-${index}`}>
              <TableCell className="py-1 font-mono text-[10px]">{hash.hex}</TableCell>
              <TableCell className="py-1 font-mono text-[10px] tabular-nums">{hash.signed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EffectFolderDetailPanel({
  item,
  inventory,
  inventoryWarnings,
  validation,
  previewSuspended = false,
  onOpenAsEffectProject,
}: EffectFolderDetailPanelProps) {
  if (!item) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <p className="text-xs text-muted-foreground">Select an entry to inspect details.</p>
          {inventoryWarnings.length > 0 ? (
            <ValidationWarnings title="Inventory warnings" messages={inventoryWarnings} />
          ) : null}
          {validation ? <ValidationResultPanel validation={validation} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 p-4">
          {inventory && (item.category === "efxbn" || item.category === "models") ? (
            <EffectFolder3dPreview item={item} inventory={inventory} previewSuspended={previewSuspended} />
          ) : null}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{item.category.toUpperCase()} details</h3>
              <Badge variant="secondary" className="text-[10px]">
                {item.category}
              </Badge>
            </div>

            {item.category === "efxbn" ? <EfxbnDetail item={item} onOpenAsEffectProject={onOpenAsEffectProject} /> : null}
            {item.category === "models" ? <ModelDetail item={item} /> : null}
            {item.category === "textures" || item.category === "other" ? (
              <FileDetail item={item} onOpenAsEffectProject={onOpenAsEffectProject} />
            ) : null}
          </div>

          {inventoryWarnings.length > 0 ? (
            <ValidationWarnings title="Inventory warnings" messages={inventoryWarnings} />
          ) : null}
          {validation ? <ValidationResultPanel validation={validation} /> : null}
        </div>
      </div>
    </div>
  );
}

function FileDetail({
  item,
  onOpenAsEffectProject,
}: {
  item: Extract<EffectListItem, { category: "textures" | "other" | "efxbn" }>;
  onOpenAsEffectProject?: (filePath: string) => void;
}) {
  const file = item.item;
  const lowerPath = file.path.toLowerCase();
  const isEffectProject = lowerPath.endsWith(".effect_project");

  return (
    <div className="space-y-3">
      {item.category === "textures" && !file.missing ? (
        <EffectNutexbPreview path={file.path} label={file.name || file.fileBaseName} />
      ) : null}

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium">File identity</h4>
          {file.hash ? <HashBadge hash={file.hash} /> : null}
        </div>
      <MetadataRow label="Name" value={file.name || file.fileBaseName} />
      <MetadataRow label="Path" value={file.path} />
      <MetadataRow label="Extension" value={file.actualExt} />
      <MetadataRow label="File index" value={String(file.fileIndex)} />
      {file.hash ? <HashMetadataRow label="Hash" hash={file.hash} /> : null}
      {file.unk2 ? <MetadataRow label="unk2" value={file.unk2} /> : null}
      <MetadataRow label="Missing" value={file.missing ? "yes" : "no"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void openPath(file.path)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Open file
        </Button>
        {isEffectProject && onOpenAsEffectProject ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenAsEffectProject(file.path)}>
            Open effect project
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function EfxbnDetail({
  item,
  onOpenAsEffectProject,
}: {
  item: Extract<EffectListItem, { category: "efxbn" }>;
  onOpenAsEffectProject?: (filePath: string) => void;
}) {
  const file = item.item;
  const summary = file.efxbn;

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium">Effect resource</h4>
          {file.hash ? <HashBadge hash={file.hash} /> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Effects</div>
            <div className="font-mono text-sm">{summary?.effectCount ?? "-"}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Model refs</div>
            <div className="font-mono text-sm">{summary?.modelIds.filter((hash) => hash.signed !== 0).length ?? "-"}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Texture params</div>
            <div className="font-mono text-sm">{summary?.textureParameters.length ?? "-"}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Unknowns</div>
            <div className="font-mono text-sm">{summary?.todo.unknowns.length ?? "-"}</div>
          </div>
        </div>
      </div>
      <FileDetail item={item} onOpenAsEffectProject={onOpenAsEffectProject} />
      {summary ? (
        <div className="space-y-2 rounded-md border p-3">
          <h4 className="text-xs font-medium">EFXBN parse</h4>
          <MetadataRow label="Magic" value={summary.magic} />
          <MetadataRow label="Version/flags" value={String(summary.versionOrFlags)} />
          <MetadataRow label="Effect count" value={String(summary.effectCount)} />
          <MetadataRow label="unk0x18" value={String(summary.unk0x18)} />
          <MetadataRow label="unk0x1C" value={String(summary.unk0x1C)} />
          <MetadataRow label="Control lookup" value={`${summary.controlLookupEntries.length} entries`} />
          <MetadataRow label="Texture parameters" value={String(summary.textureParameters.length)} />
          <div className="space-y-2">
            <h5 className="text-[11px] font-medium text-muted-foreground">Model IDs</h5>
            <ModelIdTable hashes={summary.modelIds} />
          </div>
          {summary.effects.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-[10px]">#</TableHead>
                    <TableHead className="h-8 text-[10px]">Model</TableHead>
                    <TableHead className="h-8 text-[10px]">Animation</TableHead>
                    <TableHead className="h-8 text-[10px]">Control refs</TableHead>
                    <TableHead className="h-8 text-[10px]">unk32</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.effects.map((effect) => (
                    <TableRow key={effect.index}>
                      <TableCell className="py-1 font-mono text-[10px]">{effect.index}</TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">{effect.modelHash.hex}</TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">{effect.animationHash.hex}</TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">
                        {effect.controlReferences.filter((ref) => ref.selector !== 0 || ref.lookupIndex !== 0).length} active
                      </TableCell>
                      <TableCell className="py-1 font-mono text-[10px] tabular-nums">{effect.metaParsed.unk32}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {summary.textureParameters.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-[11px] font-medium text-muted-foreground">Texture parameters</h5>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-[10px]">#</TableHead>
                      <TableHead className="h-8 text-[10px]">Texture</TableHead>
                      <TableHead className="h-8 text-[10px]">Addressing</TableHead>
                      <TableHead className="h-8 text-[10px]">UV pattern</TableHead>
                      <TableHead className="h-8 text-[10px]">Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.textureParameters.map((parameter) => (
                      <TableRow key={parameter.index}>
                        <TableCell className="py-1 font-mono text-[10px]">{parameter.index}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px]">{parameter.colorMapHash.hex}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px] tabular-nums">{parameter.addressingMode}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px] tabular-nums">{parameter.uvPatternType}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px]">0x{parameter.textureSettingFlags.toString(16).toUpperCase()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {summary.todo.unknowns.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-[11px] font-medium text-muted-foreground">Unknown follow-up</h5>
              <div className="rounded-md border">
                {summary.todo.unknowns.slice(0, 6).map((item) => (
                  <div key={item.field} className="border-b px-2 py-1.5 text-[11px] last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{item.field}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {item.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModelDetail({ item }: { item: Extract<EffectListItem, { category: "models" }> }) {
  const model = item.model;

  return (
    <div>
      <MetadataRow label="Name" value={model.name} />
      <HashMetadataRow label="Hash" hash={model.hash} />
      <MetadataRow label="Folder unk3" value={String(model.folderUnk3)} />
      <MetadataRow
        label="Missing required"
        value={model.missingRequiredExts.length > 0 ? model.missingRequiredExts.join(", ") : "none"}
      />

      <div className="mt-3">
        <h4 className="mb-2 text-xs font-medium">Model files ({model.files.length})</h4>
        <ul className="space-y-1">
          {model.files.map((file) => (
            <li
              key={file.fileIndex}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name || file.fileBaseName}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{file.actualExt}</p>
                {file.hash ? (
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{formatEffectFolderHash(file.hash)}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {file.missing ? (
                  <Badge variant="destructive" className="text-[10px]">
                    missing
                  </Badge>
                ) : null}
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void openPath(file.path)}>
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ValidationWarnings({ title, messages }: { title: string; messages: string[] }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
      <h4 className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">{title}</h4>
      <ul className="list-disc space-y-1 pl-4 text-[11px] text-amber-900 dark:text-amber-100">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function ValidationResultPanel({ validation }: { validation: EffectFolderValidationResult }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium">Last validation</h4>
        <Badge variant={validation.valid ? "default" : "destructive"} className="text-[10px]">
          {validation.valid ? "valid" : "invalid"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
        <span>EFXBN: {validation.summary.efxbnCount}</span>
        <span>Models: {validation.summary.modelCount}</span>
        <span>Textures: {validation.summary.textureCount}</span>
        <span>Unresolved models: {validation.summary.unresolvedModelIdCount}</span>
      </div>
      {validation.errors.length > 0 ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px] text-destructive">
          {validation.errors.map((error, index) => (
            <li key={`${error.phase}-${error.message}-${index}`}>
              [{error.phase}] {error.message}
            </li>
          ))}
        </ul>
      ) : null}
      {validation.warnings.length > 0 ? (
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] text-amber-700 dark:text-amber-300">
          {validation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
