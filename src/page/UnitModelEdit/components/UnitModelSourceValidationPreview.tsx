import { AlertTriangle, CheckCircle2, FileBox, ImageIcon, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { UnitModelSourceValidation } from "../utils/unitModelModelService";

const TEXTURE_LIST_CAP = 12;

export type UnitModelSourceTexturePlan = {
  referenced: string[];
  copiedFromSource: string[];
  reusedFromPool: string[];
  missing: string[];
};

function TextureList({ items }: { items: string[] }) {
  const shown = items.slice(0, TEXTURE_LIST_CAP);
  const extra = items.length - shown.length;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {shown.map((name) => (
        <li
          key={name}
          className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {name}
        </li>
      ))}
      {extra > 0 ? (
        <li className="rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          +{extra} more
        </li>
      ) : null}
    </ul>
  );
}

type UnitModelSourceValidationPreviewProps = {
  validation: UnitModelSourceValidation;
  /** True when a model with this name already exists in the package (add would be rejected). */
  duplicateName?: boolean;
  mode?: "add" | "replace";
  texturePlan?: UnitModelSourceTexturePlan | null;
};

/**
 * Read-only report of a scanned prepared SSBH model folder. Shared by the Add and Replace flows so
 * the operator sees exactly what will be copied/deduped before committing a package mutation.
 */
export function UnitModelSourceValidationPreview({
  validation,
  duplicateName = false,
  mode = "add",
  texturePlan = null,
}: UnitModelSourceValidationPreviewProps) {
  const copied = texturePlan?.copiedFromSource ?? validation.sourceTexturesFound;
  const fromPool = texturePlan?.reusedFromPool ?? [];
  const missing = texturePlan?.missing ?? validation.textureReferencesNotInSource;
  const createsEmptyNuhlpb = mode === "add";

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-start gap-2">
        <FileBox className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium">
            Model name: <span className="font-mono">{validation.modelName}</span>
          </p>
          <p className="break-all font-mono text-[10px] text-muted-foreground" title={validation.sourceDir}>
            {validation.sourceDir}
          </p>
        </div>
      </div>

      {duplicateName ? (
        <p className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          A model named "{validation.modelName}" already exists in this package. Remove it first, or
          use Replace instead of Add.
        </p>
      ) : null}

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Required files</p>
        <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          {validation.requiredFiles.map((file) => (
            <li key={file} className="flex items-center gap-1.5 font-mono text-[11px]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
              {file}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/10 p-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Textures referenced by materials: {validation.textureReferences.length}
        </p>
        {copied.length > 0 ? (
          <div className="mt-1.5">
            <p className="text-[10px] text-muted-foreground">
              {copied.length} found in folder — will be copied and deduped into the shared pool:
            </p>
            <TextureList items={copied} />
          </div>
        ) : null}
        {fromPool.length > 0 ? (
          <div className="mt-2">
            <p className="text-[10px] text-muted-foreground">
              {fromPool.length} already in the package texture pool — will be reused:
            </p>
            <TextureList items={fromPool} />
          </div>
        ) : null}
        {missing.length > 0 ? (
          <div className="mt-2">
            <p className={cn("text-[10px]", "text-red-600 dark:text-red-400")}>
              {missing.length} missing from both the folder and package texture pool:
            </p>
            <TextureList items={missing} />
          </div>
        ) : null}
      </div>

      <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {createsEmptyNuhlpb
          ? validation.ignoredSourceNuhlpb
            ? "The source NUHLPB is ignored; a fresh empty NUHLPB will be created for this model."
            : "A fresh empty NUHLPB will be created for this model."
          : validation.ignoredSourceNuhlpb
            ? "The source NUHLPB is ignored; the target model's existing NUHLPB will be kept."
            : "The target model's existing NUHLPB will be kept."}
      </p>
    </div>
  );
}
