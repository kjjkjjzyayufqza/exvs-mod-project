import { FileJson, FolderOpen, Hash } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  normalizeFhm2dHashName,
  sanitizeFhm2dStructureName,
} from "@/utils/fhm2dStructureMetadata";
import { findFhm2dNameMapping } from "@/utils/fhm2dNameMapping";

type Fhm2dNameFieldProps = {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  sourceNameOrPath?: string | null;
  routeId?: string | null;
  routePrefix?: string | null;
  folderPath?: string | null;
  structureJsonPath?: string | null;
  disabled?: boolean;
  className?: string;
  description?: string;
};

export function Fhm2dNameField({
  id,
  label = "Name",
  value,
  onChange,
  sourceNameOrPath,
  routeId,
  routePrefix,
  folderPath,
  structureJsonPath,
  disabled = false,
  className,
  description,
}: Fhm2dNameFieldProps) {
  const { t } = useTranslation("fhm2d-meta");
  const fieldLabel = label ?? "Name";
  const fieldDescription = description ?? t("nameField.defaultDescription");
  const sanitizedName = sanitizeFhm2dStructureName(value);
  const hashName = normalizeFhm2dHashName(sourceNameOrPath);
  const mappingEntry = findFhm2dNameMapping(hashName ?? sourceNameOrPath, {
    routeId,
    routePrefix,
    structureJsonPath,
  });

  return (
    <div className={cn("space-y-2", className)}>
      <div className="space-y-1">
        <Label htmlFor={id} data-i18n-ignore="">{fieldLabel}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{fieldDescription}</p>
      </div>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder="Gyan_model"
        data-i18n-ignore=""
        onChange={(event) => onChange(sanitizeFhm2dStructureName(event.target.value))}
      />
      <div className="grid gap-2 rounded-md border bg-muted/20 p-2.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5" />
            {t("nameField.sanitizedName")}
          </span>
          <span className="min-w-0 break-all font-mono font-medium">{sanitizedName}</span>
        </div>
        <div className="flex items-center justify-between gap-3" data-i18n-ignore="">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            HashName
          </span>
          <span className={cn("min-w-0 break-all font-mono font-medium", !hashName && "text-destructive")}>
            {hashName ?? t("nameField.needsHash")}
          </span>
        </div>
        {mappingEntry ? (
          <div className="flex items-start justify-between gap-3">
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" />
              {t("nameField.dictionary")}
            </span>
            <span className="min-w-0 break-all text-right font-mono">
              {mappingEntry.name}
              <span className="ml-1 text-muted-foreground">({mappingEntry.confidence})</span>
            </span>
          </div>
        ) : null}
        {folderPath ? (
          <div className="flex items-start justify-between gap-3">
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" />
              {t("nameField.folder")}
            </span>
            <span className="min-w-0 break-all text-right font-mono">{folderPath}</span>
          </div>
        ) : null}
        {structureJsonPath ? (
          <div className="flex items-start justify-between gap-3">
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <FileJson className="h-3.5 w-3.5" />
              JSON
            </span>
            <span className="min-w-0 break-all text-right font-mono">{structureJsonPath}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
